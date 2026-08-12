import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { NotifyService } from '../notifications/notify.service';
import { QuotaService } from '../quota/quota.service';

export type PromoKind = 'targeted' | 'referral';

export interface PromoReward {
  storageBytes: number;
  extraWorkspaces: number;
  extraAlbumsPerWorkspace: number;
}

export interface Promo extends PromoReward {
  id: string;
  name: string;
  description: string | null;
  kind: PromoKind;
  claimWindowDays: number | null;
  active: boolean;
  createdAt: string;
  /** How many grants exist, and how many were taken. Admin view only. */
  granted?: number;
  claimed?: number;
}

/** A promo offered to the signed-in user, as they see it. */
export interface OfferedPromo extends PromoReward {
  grantId: string;
  name: string;
  description: string | null;
  kind: PromoKind;
  expiresAt: string | null;
  /** Who joining earned this, for a referral. */
  referredName: string | null;
}

/** What claiming gives back: what was won, and what the account now has. */
export interface ClaimResult {
  claimed: true;
  /** "15 GB of storage and 1 extra workspace". */
  reward: string;
  /** The account's totals *after* the claim. null means unlimited. */
  limits: {
    storageBytes: number | null;
    workspaces: number | null;
    albumsPerWorkspace: number | null;
  };
}

/** What entering somebody's invite code did. */
export interface ReferralResult {
  accepted: true;
  /**
   * Whether a reward was actually granted. False when no referral promo is
   * running — the code is still recorded, there is just nothing to pay.
   */
  rewarded: boolean;
}

/** One grant, as the console lists them. */
export interface PromoGrantRow {
  id: string;
  userId: string;
  displayName: string | null;
  email: string;
  claimedAt: string | null;
  expiresAt: string | null;
  referredName: string | null;
  createdAt: string;
}

interface PromoRow {
  id: string;
  name: string;
  description: string | null;
  kind: PromoKind;
  storage_bytes: string;
  extra_workspaces: number;
  extra_albums_per_workspace: number;
  claim_window_days: number | null;
  active: boolean;
  created_at: Date;
  granted?: string;
  claimed?: string;
}

/**
 * A single promo is capped well below anything that could cost real money by
 * accident. A typo of one extra zero in the console is otherwise a terabyte.
 */
const MAX_STORAGE_BYTES = 1024 ** 4; // 1 TB
const MAX_EXTRA_WORKSPACES = 100;
const MAX_EXTRA_ALBUMS = 100;

@Injectable()
export class PromosService {
  private readonly logger = new Logger(PromosService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notify: NotifyService,
    /**
     * Only to read back the new totals after a claim. No cycle: QuotaService
     * sums claimed grants with its own query rather than calling back in here,
     * and QuotaModule is @Global so nothing has to import it.
     */
    private readonly quota: QuotaService,
  ) {}

  private present(row: PromoRow): Promo {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind,
      storageBytes: Number(row.storage_bytes),
      extraWorkspaces: row.extra_workspaces,
      extraAlbumsPerWorkspace: row.extra_albums_per_workspace,
      claimWindowDays: row.claim_window_days,
      active: row.active,
      createdAt: row.created_at.toISOString(),
      ...(row.granted !== undefined ? { granted: Number(row.granted) } : {}),
      ...(row.claimed !== undefined ? { claimed: Number(row.claimed) } : {}),
    };
  }

  private assertRewardsSomething(reward: PromoReward): void {
    const { storageBytes, extraWorkspaces, extraAlbumsPerWorkspace } = reward;
    if (
      storageBytes <= 0 &&
      extraWorkspaces <= 0 &&
      extraAlbumsPerWorkspace <= 0
    ) {
      throw new BadRequestException(
        'A promo has to give something — set storage, workspaces or albums above zero.',
      );
    }
    if (storageBytes > MAX_STORAGE_BYTES) {
      throw new BadRequestException('That is more than 1 TB of storage. Check the figure.');
    }
    if (extraWorkspaces > MAX_EXTRA_WORKSPACES) {
      throw new BadRequestException(`At most ${MAX_EXTRA_WORKSPACES} extra workspaces.`);
    }
    if (extraAlbumsPerWorkspace > MAX_EXTRA_ALBUMS) {
      throw new BadRequestException(`At most ${MAX_EXTRA_ALBUMS} extra albums per workspace.`);
    }
  }

  // ─── admin ────────────────────────────────────────────────────────────────

  async list(): Promise<Promo[]> {
    const rows = await this.db.query<PromoRow>(
      `select p.*,
              (select count(*) from promo_grants g where g.promo_id = p.id)::text as granted,
              (select count(*) from promo_grants g
                where g.promo_id = p.id and g.claimed_at is not null)::text as claimed
         from promos p
        order by p.created_at desc`,
    );
    return rows.map((r) => this.present(r));
  }

  async create(
    adminId: string | null,
    input: {
      name: string;
      description?: string;
      kind: PromoKind;
      storageBytes?: number;
      extraWorkspaces?: number;
      extraAlbumsPerWorkspace?: number;
      claimWindowDays?: number | null;
    },
  ): Promise<Promo> {
    const reward: PromoReward = {
      storageBytes: input.storageBytes ?? 0,
      extraWorkspaces: input.extraWorkspaces ?? 0,
      extraAlbumsPerWorkspace: input.extraAlbumsPerWorkspace ?? 0,
    };
    this.assertRewardsSomething(reward);

    const row = await this.db.queryOne<PromoRow>(
      `insert into promos
         (name, description, kind, storage_bytes, extra_workspaces,
          extra_albums_per_workspace, claim_window_days, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [
        input.name.trim(),
        input.description?.trim() || null,
        input.kind,
        reward.storageBytes,
        reward.extraWorkspaces,
        reward.extraAlbumsPerWorkspace,
        input.claimWindowDays ?? null,
        adminId,
      ],
    );
    return this.present(row!);
  }

  /** Switches a promo on or off. Never touches rewards already claimed. */
  async setActive(id: string, active: boolean): Promise<Promo> {
    const row = await this.db.queryOne<PromoRow>(
      `update promos set active = $2, updated_at = now() where id = $1 returning *`,
      [id, active],
    );
    if (!row) throw new NotFoundException('Promo not found');
    return this.present(row);
  }

  /**
   * Offers a targeted promo to a list of accounts.
   *
   * Idempotent by index: selecting somebody twice, or re-running the same
   * selection, adds nothing. Returns how many were newly offered so the
   * console can say "12 of 30 were already on this" rather than implying it
   * sent 30 fresh offers.
   */
  async grantTo(promoId: string, userIds: string[]): Promise<{ granted: number }> {
    const promo = await this.db.queryOne<PromoRow>(
      'select * from promos where id = $1',
      [promoId],
    );
    if (!promo) throw new NotFoundException('Promo not found');
    if (promo.kind !== 'targeted') {
      throw new BadRequestException(
        'A referral promo pays out when somebody joins. It cannot be handed to people directly.',
      );
    }
    if (!promo.active) {
      throw new BadRequestException('Switch the promo on before offering it.');
    }
    if (userIds.length === 0) return { granted: 0 };

    const expiresAt = promo.claim_window_days
      ? new Date(Date.now() + promo.claim_window_days * 86_400_000)
      : null;

    const rows = await this.db.query<{ user_id: string }>(
      `insert into promo_grants (promo_id, user_id, expires_at)
       select $1, u.id, $3
         from unnest($2::uuid[]) as sel(id)
         join users u on u.id = sel.id
       on conflict do nothing
       returning user_id`,
      [promoId, userIds, expiresAt],
    );

    const label = this.rewardLabel(this.present(promo));
    await Promise.all(
      rows.map((r) =>
        this.notify.notify([r.user_id], {
          topic: 'promo',
          title: promo.name,
          body: `${label} is waiting for you. Open it to claim.`,
          data: { promoId },
        }),
      ),
    );

    this.logger.log(
      `promo ${promoId}: offered to ${rows.length} of ${userIds.length} selected`,
    );
    return { granted: rows.length };
  }

  /**
   * Who holds a grant for this promo, and whether they took it.
   *
   * Console-only. Ordered unclaimed first so the useful half of a long list —
   * the people who have not responded — is the half you land on.
   */
  async grants(promoId: string): Promise<PromoGrantRow[]> {
    const rows = await this.db.query<{
      id: string;
      user_id: string;
      display_name: string | null;
      email: string;
      claimed_at: Date | null;
      expires_at: Date | null;
      referred_name: string | null;
      created_at: Date;
    }>(
      // Same `r.id <> g.user_id` as offers(): both sides of a referral carry
      // the same referred_user_id, and only the referrer's row is the one that
      // was earned by somebody else joining.
      `select g.id, g.user_id, u.display_name, u.email,
              g.claimed_at, g.expires_at, g.created_at,
              r.display_name as referred_name
         from promo_grants g
         join users u on u.id = g.user_id
         left join users r
           on r.id = g.referred_user_id and r.id <> g.user_id
        where g.promo_id = $1
        order by g.claimed_at nulls first, g.created_at desc
        limit 500`,
      [promoId],
    );

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      claimedAt: r.claimed_at ? r.claimed_at.toISOString() : null,
      expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
      referredName: r.referred_name,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /** Human-readable summary of what a promo gives. */
  rewardLabel(promo: PromoReward): string {
    const parts: string[] = [];
    if (promo.storageBytes > 0) {
      const gb = promo.storageBytes / 1024 ** 3;
      parts.push(`${gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(promo.storageBytes / 1024 ** 2)} MB`} of storage`);
    }
    if (promo.extraWorkspaces > 0) {
      parts.push(`${promo.extraWorkspaces} extra workspace${promo.extraWorkspaces === 1 ? '' : 's'}`);
    }
    if (promo.extraAlbumsPerWorkspace > 0) {
      parts.push(
        `${promo.extraAlbumsPerWorkspace} more album${promo.extraAlbumsPerWorkspace === 1 ? '' : 's'} per workspace`,
      );
    }
    if (parts.length === 0) return 'A reward';
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }

  // ─── the recipient ────────────────────────────────────────────────────────

  /**
   * What this account is being offered right now.
   *
   * Unclaimed and unexpired only. An offer nobody took before it lapsed is
   * not shown, because there is nothing to be done about it and a dead offer
   * on screen reads as a bug.
   */
  async offers(userId: string): Promise<OfferedPromo[]> {
    const rows = await this.db.query<{
      grant_id: string;
      name: string;
      description: string | null;
      kind: PromoKind;
      storage_bytes: string;
      extra_workspaces: number;
      extra_albums_per_workspace: number;
      expires_at: Date | null;
      referred_name: string | null;
    }>(
      /*
       * `r.id <> g.user_id` on the join, not just `r.id = g.referred_user_id`.
       *
       * A referral now grants both people, and both rows carry the same
       * referred_user_id — so the referee's own grant joined to the referee and
       * the card read "you earned this when Bob joined with your code" to Bob.
       * The name is only meaningful on the referrer's copy.
       */
      `select g.id as grant_id, p.name, p.description, p.kind,
              p.storage_bytes, p.extra_workspaces, p.extra_albums_per_workspace,
              g.expires_at, r.display_name as referred_name
         from promo_grants g
         join promos p on p.id = g.promo_id
         left join users r
           on r.id = g.referred_user_id and r.id <> g.user_id
        where g.user_id = $1
          and g.claimed_at is null
          and (g.expires_at is null or g.expires_at > now())
        order by g.created_at desc`,
      [userId],
    );

    return rows.map((r) => ({
      grantId: r.grant_id,
      name: r.name,
      description: r.description,
      kind: r.kind,
      storageBytes: Number(r.storage_bytes),
      extraWorkspaces: r.extra_workspaces,
      extraAlbumsPerWorkspace: r.extra_albums_per_workspace,
      expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
      referredName: r.referred_name,
    }));
  }

  /**
   * Takes an offer.
   *
   * The where clause is the whole guard: it matches only a grant belonging to
   * this user that is still unclaimed and unexpired, so a replayed request,
   * two taps, or somebody else's grant id all fall through to the same
   * "nothing to claim" rather than paying out twice.
   */
  async claim(userId: string, grantId: string): Promise<ClaimResult> {
    const row = await this.db.queryOne<{ promo_id: string }>(
      `update promo_grants
          set claimed_at = now()
        where id = $1
          and user_id = $2
          and claimed_at is null
          and (expires_at is null or expires_at > now())
        returning promo_id`,
      [grantId, userId],
    );
    if (!row) {
      throw new NotFoundException(
        'That offer is no longer available — it may have been claimed already, or expired.',
      );
    }

    const promo = await this.db.queryOne<PromoRow>(
      'select * from promos where id = $1',
      [row.promo_id],
    );

    /*
     * The new totals, read back after the claim.
     *
     * So the congratulation can say "your storage is now 30 GB" rather than
     * only "you got 15 GB". A promo adds to what the plan already gives, and
     * naming the reward alone leaves somebody to do that sum themselves — or
     * to wonder whether it replaced their allowance instead of adding to it.
     */
    const limits = await this.limitsFor(userId);

    return {
      claimed: true,
      reward: this.rewardLabel(this.present(promo!)),
      limits,
    };
  }

  /** The account's limits as JSON — Infinity is not representable, so null. */
  private async limitsFor(userId: string): Promise<ClaimResult['limits']> {
    const limits = await this.quota.limits(userId);
    const finite = (n: number) => (Number.isFinite(n) ? n : null);
    return {
      storageBytes: finite(limits.storageBytes),
      workspaces: finite(limits.workspaces),
      albumsPerWorkspace: finite(limits.albumsPerWorkspace),
    };
  }

  // ─── referrals ────────────────────────────────────────────────────────────

  /**
   * This account's own code, generated on first read.
   *
   * Not generated at signup: most accounts never share one, and a column
   * filled for everybody is a column of mostly-unused random strings.
   */
  async referralCode(userId: string): Promise<string> {
    const existing = await this.db.queryOne<{ referral_code: string | null }>(
      'select referral_code from users where id = $1',
      [userId],
    );
    if (existing?.referral_code) return existing.referral_code;

    // Retry on collision rather than trusting entropy blindly. Six bytes of
    // base32 is plenty, but "plenty" is not "never" and the unique index
    // would otherwise surface as a 500.
    //
    // The two failures are different and only one is worth retrying: a code
    // already held by somebody else raises 23505 and deserves another draw,
    // whereas an empty result means this account got a code from a concurrent
    // request and we should return that one.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(5)
        .toString('base64url')
        .replace(/[-_]/g, '')
        .toUpperCase()
        .slice(0, 7);

      try {
        const row = await this.db.queryOne<{ referral_code: string }>(
          `update users set referral_code = $2
            where id = $1 and referral_code is null
            returning referral_code`,
          [userId, code],
        );
        if (row) return row.referral_code;
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
        this.logger.warn(`Referral code collision on ${code}, drawing again`);
        continue;
      }

      const now = await this.db.queryOne<{ referral_code: string | null }>(
        'select referral_code from users where id = $1',
        [userId],
      );
      if (now?.referral_code) return now.referral_code;
    }
    throw new BadRequestException('Could not allocate a referral code. Try again.');
  }

  /** Resolves a shared code to the account that owns it. */
  async userForCode(code: string): Promise<string | null> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from users where referral_code = $1',
      [code.trim().toUpperCase()],
    );
    return row?.id ?? null;
  }

  /**
   * Records who referred this account, from inside the app.
   *
   * Signup is not the only moment somebody is handed a code — most people get
   * one from a friend after they have already joined, and a field reachable
   * only by starting over is a field nobody uses.
   *
   * Safe to expose because the caller is signed in, which means verified, so
   * this cannot be used to pay out on an address nobody owns. The rest is
   * guarded here: once only, never your own code, and never somebody you
   * referred yourself.
   */
  async redeemReferralCode(userId: string, code: string): Promise<ReferralResult> {
    const me = await this.db.queryOne<{
      referred_by_user_id: string | null;
      referral_code: string | null;
    }>(
      'select referred_by_user_id, referral_code from users where id = $1',
      [userId],
    );
    if (!me) throw new NotFoundException('Account not found');

    if (me.referred_by_user_id) {
      throw new BadRequestException(
        'You have already used an invite code. Each account can use one.',
      );
    }

    const referrer = await this.userForCode(code);
    if (!referrer) {
      throw new BadRequestException('That code does not match anybody. Check it and try again.');
    }
    if (referrer === userId) {
      throw new BadRequestException('That is your own code — share it with somebody else.');
    }

    /*
     * Not somebody this account already referred.
     *
     * Two people swapping codes is the cheapest way to farm a reward that pays
     * both sides: each invites the other and both collect twice. Every other
     * guard here is about a single account, so this is the one that has to look
     * at the pair.
     */
    const mutual = await this.db.queryOne<{ id: string }>(
      'select id from users where id = $1 and referred_by_user_id = $2',
      [referrer, userId],
    );
    if (mutual) {
      throw new BadRequestException(
        'You invited them, so they cannot invite you back.',
      );
    }

    const updated = await this.db.queryOne<{ id: string }>(
      `update users
          set referred_by_user_id = $2, referred_at = now()
        where id = $1 and referred_by_user_id is null
        returning id`,
      [userId, referrer],
    );
    // Lost a race with another request doing the same thing.
    if (!updated) {
      throw new BadRequestException('You have already used an invite code.');
    }

    const paid = await this.payReferral(userId);
    return {
      accepted: true,
      // False when referrals are switched off. The code is still recorded —
      // turning the promo back on later does not retroactively pay, but the
      // relationship is not lost either.
      rewarded: paid,
    };
  }

  /**
   * Pays out a referral, to both sides.
   *
   * Called from email verification, never from signup. An unverified signup
   * paying out is the whole attack: addresses are free, and a referral that
   * pays before anybody proves they own one is a storage tap. Also called
   * straight from `redeemReferralCode`, where the caller is signed in and so
   * already verified.
   *
   * Both people get the same promo. It rewarded the referrer alone, which made
   * an invitation a worse thing to send: on a free tier the person being
   * invited has nothing yet, and "join so I get storage" persuades nobody.
   *
   * Silent when there is no active referral promo — referrals being switched
   * off is a normal state, not an error on somebody's verification. Returns
   * whether anything was actually paid.
   */
  async payReferral(referredUserId: string): Promise<boolean> {
    const referred = await this.db.queryOne<{
      referred_by_user_id: string | null;
      display_name: string | null;
    }>(
      'select referred_by_user_id, display_name from users where id = $1',
      [referredUserId],
    );
    const referrer = referred?.referred_by_user_id;
    if (!referrer) return false;

    const promo = await this.db.queryOne<PromoRow>(
      `select * from promos
        where kind = 'referral' and active = true
        order by created_at desc
        limit 1`,
    );
    if (!promo) return false;

    const expiresAt = promo.claim_window_days
      ? new Date(Date.now() + promo.claim_window_days * 86_400_000)
      : null;

    /*
     * Two rows from one statement, so a crash between them is not a state
     * where one side was paid and the other was not.
     *
     * `on conflict do nothing` against the (promo, user, referred) index makes
     * this idempotent: a replay inserts nothing and returns nothing.
     */
    const rows = await this.db.query<{ user_id: string }>(
      `insert into promo_grants (promo_id, user_id, expires_at, referred_user_id)
       select $1, u, $3, $4 from unnest($2::uuid[]) as u
       on conflict do nothing
       returning user_id`,
      [promo.id, [referrer, referredUserId], expiresAt, referredUserId],
    );
    if (rows.length === 0) return false;

    const label = this.rewardLabel(this.present(promo));
    const who = referred?.display_name ?? 'Someone you invited';

    await Promise.all(
      rows.map((r) =>
        this.notify.notify([r.user_id], {
          topic: 'promo',
          title: promo.name,
          body:
            r.user_id === referrer
              ? `${who} joined with your code. ${label} is waiting — open it to claim.`
              : `You used an invite code. ${label} is waiting — open it to claim.`,
          data: { promoId: promo.id },
        }),
      ),
    );

    this.logger.log(`referral paid to ${rows.length} account(s) for ${referredUserId}`);
    return true;
  }
}
