'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCreateScheduleEvent,
  useDeleteScheduleEvent,
  useScheduleEvents,
} from '@/hooks/useScheduleEvents';
import { useCreateReminder, useDeleteReminder, useReminders } from '@/hooks/useReminders';
import {
  DAYS,
  MONTHS,
  formatTime,
  getMonthWeeks,
  isEventUpcoming,
  labelForDateKey,
  todayKey,
} from '@/lib/calendar';
import type { EventType } from '@/api';

const EVENT_TYPES: EventType[] = ['shoot', 'editing', 'review', 'delivery', 'meeting'];

function NewEventDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
}) {
  const create = useCreateScheduleEvent();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [type, setType] = useState<EventType>('shoot');

  useEffect(() => {
    if (open) setDate(defaultDate);
  }, [open, defaultDate]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !date) return;
    create.mutate(
      {
        title: trimmed,
        description: description.trim() || null,
        event_date: date,
        event_time: time || null,
        event_type: type,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setTitle('');
          setDescription('');
          setTime('');
        },
        onError: (err: Error) =>
          toast.error('Could not create event', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>A shoot, an edit, a review or a delivery.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reyes wedding — ceremony"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="event-date">Date</Label>
              {/* A native date input: the browser gives a real, localised,
                  keyboard-accessible picker for free. */}
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-time">Time</Label>
              <Input
                id="event-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-description">Notes</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || !date || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewReminderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateReminder();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New reminder</DialogTitle>
          <DialogDescription>
            The mobile app alarms at this time, and the server pushes it too.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Send the Reyes gallery"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reminder-when">When</Label>
            <Input
              id="reminder-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !when || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  title: title.trim(),
                  // datetime-local has no zone; the Date constructor reads it
                  // as local time, which is what the user meant.
                  reminder_time: new Date(when).toISOString(),
                  is_alarm_enabled: true,
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    setTitle('');
                    setWhen('');
                  },
                  onError: (err: Error) =>
                    toast.error('Could not create reminder', { description: err.message }),
                },
              )
            }
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create reminder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => new Date());
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [creatingReminder, setCreatingReminder] = useState(false);

  // ?new=1 and ?date=… let links from anywhere land on the right day, already
  // open. Cleared afterwards so a refresh does not reopen the dialog.
  useEffect(() => {
    const date = searchParams.get('date');
    if (date) {
      setSelected(date);
      setCursor(new Date(`${date}T00:00:00`));
    }
    if (searchParams.get('new') === '1') setCreatingEvent(true);
    if (date || searchParams.get('new')) router.replace('/schedule');
  }, [searchParams, router]);

  const { events, isLoading } = useScheduleEvents({ limit: 200 });
  const { reminders } = useReminders({ orderBy: 'reminder_time', direction: 'asc', limit: 100 });
  const removeEvent = useDeleteScheduleEvent();
  const removeReminder = useDeleteReminder();

  const weeks = useMemo(
    () => getMonthWeeks(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const event of events) {
      (map[event.event_date] ??= []).push(event);
    }
    return map;
  }, [events]);

  const now = new Date();
  const dayEvents = eventsByDate[selected] ?? [];
  const upcoming = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time, now))
    .sort((a, b) =>
      `${a.event_date}${a.event_time ?? ''}`.localeCompare(
        `${b.event_date}${b.event_time ?? ''}`,
      ),
    );

  const shiftMonth = (by: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + by, 1));

  return (
    <AppShell title="Schedule">
      <PageHeader
        title="Schedule"
        description={`${events.length} event${events.length === 1 ? '' : 's'} · ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCreatingReminder(true)}>
              <Bell className="size-4" />
              Reminder
            </Button>
            <Button onClick={() => setCreatingEvent(true)}>
              <Plus className="size-4" />
              New event
            </Button>
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_20rem]">
        {/* Calendar */}
        <Card className="h-fit">
          <CardContent className="py-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCursor(new Date());
                    setSelected(today);
                  }}
                >
                  Today
                </Button>
                <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {day}
                </div>
              ))}
              {weeks.flat().map((cell) => {
                const count = (eventsByDate[cell.key] ?? []).length;
                const isSelected = cell.key === selected;
                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelected(cell.key)}
                    className={cn(
                      'relative aspect-square rounded-lg text-sm transition-colors',
                      cell.isOutside && 'text-muted-foreground/40',
                      isSelected
                        ? 'bg-primary font-bold text-primary-foreground'
                        : 'hover:bg-accent',
                      cell.isToday && !isSelected && 'font-bold text-primary',
                    )}
                  >
                    {cell.day}
                    {count > 0 && (
                      <span
                        className={cn(
                          'absolute inset-x-0 bottom-1.5 mx-auto size-1 rounded-full',
                          isSelected ? 'bg-primary-foreground' : 'bg-primary',
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day detail + lists */}
        <div className="min-w-0">
          <Tabs defaultValue="day">
            <TabsList className="w-full">
              <TabsTrigger value="day" className="flex-1">
                {labelForDateKey(selected)}
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="flex-1">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="reminders" className="flex-1">
                Reminders
              </TabsTrigger>
            </TabsList>

            <TabsContent value="day" className="mt-4">
              {dayEvents.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={CalendarDays}
                    title="Nothing on this day"
                    action={
                      <Button size="sm" onClick={() => setCreatingEvent(true)}>
                        Add an event
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayEvents.map((event) => (
                    <li key={event.id}>
                      <Card>
                        <CardContent className="flex items-start gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{event.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {event.event_time ? formatTime(event.event_time) : 'All day'}
                            </p>
                            {event.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {event.description}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="shrink-0 capitalize">
                            {event.event_type}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete event"
                            onClick={() => removeEvent.mutate(event.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-4">
              {isLoading && events.length === 0 ? (
                <ListSkeleton rows={3} />
              ) : upcoming.length === 0 ? (
                <Card>
                  <EmptyState icon={CalendarDays} title="Nothing upcoming" />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <button
                        className="w-full text-left"
                        onClick={() => {
                          setSelected(event.event_date);
                          setCursor(new Date(`${event.event_date}T00:00:00`));
                        }}
                      >
                        <Card className="transition-colors hover:border-primary/40">
                          <CardContent className="py-3">
                            <p className="truncate text-sm font-semibold">{event.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {labelForDateKey(event.event_date)}
                              {event.event_time ? ` · ${formatTime(event.event_time)}` : ''}
                            </p>
                          </CardContent>
                        </Card>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="reminders" className="mt-4">
              {reminders.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Bell}
                    title="No reminders"
                    description="Reminders alarm on your phone even with no connection."
                    action={
                      <Button size="sm" onClick={() => setCreatingReminder(true)}>
                        Add a reminder
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {reminders.map((reminder) => (
                    <li key={reminder.id}>
                      <Card>
                        <CardContent className="flex items-center gap-3 py-3">
                          <Bell className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{reminder.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(reminder.reminder_time).toLocaleString('en-US', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete reminder"
                            onClick={() => removeReminder.mutate(reminder.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <NewEventDialog
        open={creatingEvent}
        onOpenChange={setCreatingEvent}
        defaultDate={selected}
      />
      <NewReminderDialog open={creatingReminder} onOpenChange={setCreatingReminder} />
    </AppShell>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleContent />
    </Suspense>
  );
}
