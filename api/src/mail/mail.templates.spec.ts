import { friendRequest, jobPostReported, supportReply, userReported } from './mail.templates';

/** The two emails staff get about reports, and the one a connection request sends. */

describe('userReported', () => {
  const email = userReported({
    name: 'Ana Cruz',
    handle: 'ana',
    reason: 'harassment',
    note: '<script>alert(1)</script> kept messaging me',
    reportCount: 1,
    source: 'chat',
    url: 'https://console.virgo.ph/virgo-users/2222',
  });

  it('escapes what the reporter wrote', () => {
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('links to the account in the console, in both parts', () => {
    expect(email.html).toContain('https://console.virgo.ph/virgo-users/2222');
    expect(email.text).toContain('https://console.virgo.ph/virgo-users/2222');
  });

  it('says who, why, where from and how many', () => {
    expect(email.subject).toBe('Reported account: Ana Cruz');
    expect(email.text).toContain(
      'Ana Cruz (@ana) was reported for harassment from chat. They have 1 report.',
    );
  });

  it('says so when no detail was given', () => {
    const bare = userReported({
      name: 'Ana Cruz',
      handle: null,
      reason: 'spam',
      note: null,
      reportCount: 4,
      source: null,
      url: 'https://console.virgo.ph/virgo-users/2222',
    });
    expect(bare.html).toContain('No further detail was given.');
    expect(bare.text).toContain('Ana Cruz was reported for spam. They have 4 reports.');
  });
});

describe('jobPostReported', () => {
  it('points at the console rather than a database column', () => {
    const email = jobPostReported({
      jobTitle: 'Second shooter',
      reason: 'scam',
      note: null,
      reportCount: 2,
      url: 'https://virgo.ph/jobs/second-shooter',
    });
    // The HTML part escapes the ">" like every other interpolated line.
    expect(email.html).toContain(
      'To take it down, use Hide post under Content &gt; Reports in the console.',
    );
    expect(email.text).toContain(
      'To take it down, use Hide post under Content > Reports in the console.',
    );
    expect(email.html).not.toContain('hidden_at');
    expect(email.text).not.toContain('hidden_at');
  });
});

describe('friendRequest', () => {
  const email = friendRequest({ requesterName: 'Ana', url: 'https://web.virgo.test/network' });

  it('asks to connect, in the words the apps use', () => {
    expect(email.subject).toBe('Ana wants to connect on Virgo');
    expect(email.html).toContain('New connection request');
    expect(email.text).toContain('New connection request');
  });

  it('says friend nowhere', () => {
    // The function keeps its name; what the person reads does not.
    expect(email.subject.toLowerCase()).not.toContain('friend');
    expect(email.html.toLowerCase()).not.toContain('friend');
    expect(email.text.toLowerCase()).not.toContain('friend');
  });
});

describe('supportReply', () => {
  const base = {
    name: 'Ana',
    subject: 'Album cover will not change',
    agent: 'Sam',
    reply: 'Fixed <b>now</b>.\nTry it again?',
    url: 'https://web.virgo.ph/support?ticket=1',
  };

  it('quotes the reply as text, line breaks kept', () => {
    const email = supportReply(base);
    expect(email.html).not.toContain('<b>now</b>');
    expect(email.html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(email.text).toContain('Fixed <b>now</b>.\nTry it again?');
  });

  it('says when files came with it, without attaching them', () => {
    expect(supportReply({ ...base, files: 1 }).text).toContain('Sam sent a file with this.');
    const two = supportReply({ ...base, files: 2 });
    expect(two.text).toContain('Sam sent 2 files with this. Open the conversation to see them.');
    expect(two.html).toContain('Sam sent 2 files with this.');
    expect(supportReply(base).text).not.toContain('sent a file');
  });

  it('asks how it went only once the ticket is resolved', () => {
    expect(supportReply({ ...base, resolved: true }).text).toContain('tell us how we did');
    expect(supportReply(base).text).not.toContain('tell us how we did');
  });
});
