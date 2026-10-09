import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, MessageSquare, Phone, PhoneCall } from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Notice } from "@/components/app/notice";
import { NativeSelect } from "@/components/app/native-select";
import { StageBadge } from "@/components/app/stage-badge";
import { ConfirmButton } from "@/components/app/confirm-button";
import { SubmitButton } from "@/components/app/submit-button";
import { formatDateTime, formatDay } from "@/lib/format";
import { isWinBackSource } from "@/lib/leads/constants";
import { getLead, type HistoryItem } from "@/lib/leads/service";
import { getManaInfo } from "@/lib/mana/leads";
import { contactOutcomes } from "@/lib/pipeline/defaults";
import { listColdReasons, listStages, listWinBackReasons } from "@/lib/pipeline/service";
import { dueState, isGreyedOut, todayInStockholm } from "@/lib/tasks/dates";
import { listStudioUsers, listTasksForLead } from "@/lib/tasks/service";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { t, type MessageKey } from "@/lib/i18n";
import { assignAction, finishTask, logContactAction, moveStage, removeTask, saveWinBackReason } from "../actions";
import { ManaRefresher } from "./mana-refresher";
import { NoteForm } from "./note-form";
import { TaskForm } from "./task-form";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2 className="label-caps text-lg">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dubblett?: string; fel?: string }>;
}) {
  const user = await requirePermission("leads", "read");
  const { id } = await params;
  const { dubblett, fel } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const found = await getLead(db, user.studioId, id);
  if (!found) notFound();
  const { lead, person, stage, assigneeName, history } = found;
  const today = todayInStockholm();
  const [stages, reasons, taskLists, people, mana, winBackReasons] = await Promise.all([
    listStages(db, user.studioId),
    listColdReasons(db, user.studioId),
    listTasksForLead(db, user.studioId, lead.id),
    listStudioUsers(db, user.studioId),
    getManaInfo(db, user.studioId, person.manaUserId),
    listWinBackReasons(db, user.studioId),
  ]);
  const winBack = isWinBackSource(lead.source);
  const stageName = (key: string | null) => stages.find((s) => s.key === key)?.name ?? key ?? "";
  const reasonName = (key: string | null) => reasons.find((r) => r.key === key)?.name ?? key ?? "";
  const coldStages = stages.filter((s) => s.kind === "cold");
  const move = moveStage.bind(null, lead.id);
  const log = logContactAction.bind(null, lead.id);
  const phoneHref = person.phone ? `tel:${person.phone.replace(/[^\d+]/g, "")}` : null;
  const alreadyMember = Boolean(mana && mana.counting.length > 0 && stage.kind !== "won" && !winBack);

  return (
    <div className="flex flex-col gap-5">
      <ManaRefresher leadId={lead.id} />
      <Link
        href="/leads"
        className="label-caps inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t("leads.back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="heading-display text-3xl break-words sm:text-4xl">{person.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <StageBadge name={stage.name} kind={stage.kind} />
            <span>{t(`source.${lead.source}` as MessageKey)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {phoneHref && (
            <Button asChild size="lg">
              <a href={phoneHref}>
                <Phone aria-hidden="true" />
                {t("lead.call")} <span className="font-sans tracking-normal normal-case tabular-nums">{person.phone}</span>
              </a>
            </Button>
          )}
          {person.email && (
            <Button asChild size="lg" variant="outline">
              <a href={`mailto:${person.email}`}>
                <Mail aria-hidden="true" />
                {t("lead.mail")}
              </a>
            </Button>
          )}
          {!person.phone && !person.email && <Notice tone="warning">{t("lead.noContact")}</Notice>}
        </div>
        {person.email && <p className="text-muted-foreground break-all">{person.email}</p>}
      </header>

      {dubblett === "1" && <Notice tone="warning">{t("leadForm.duplicate")}</Notice>}
      {fel === "anledning" && <Notice tone="danger">{t("lead.errorReason")}</Notice>}
      {isGreyedOut(lead.assignedToId, user.id) && <Notice>{t("assign.notice", { name: assigneeName ?? "" })}</Notice>}
      {alreadyMember && <Notice tone="warning">{t("lead.manaAlready")}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {winBack && (
            <Card className={cn(!lead.winBackReason && "border-warning-border bg-warning-surface")}>
              <CardHeader>
                <CardTitle>
                  <h2 className="label-caps text-lg">{t("winback.title")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={saveWinBackReason.bind(null, lead.id)} className="flex flex-col gap-4">
                  <p>
                    {lead.winBackReason
                      ? t("winback.current", { reason: winBackReasons.find((r) => r.key === lead.winBackReason)?.name ?? lead.winBackReason })
                      : t("winback.prompt")}
                  </p>
                  {fel === "vinnanledning" && <Notice tone="danger">{t("winback.error")}</Notice>}
                  <RadioGroup name="reason" defaultValue={lead.winBackReason ?? undefined} required className="gap-1">
                    {winBackReasons.map((r) => (
                      <Label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-base font-normal hover:bg-accent/60">
                        <RadioGroupItem value={r.key} />
                        {r.name}
                      </Label>
                    ))}
                  </RadioGroup>
                  <SubmitButton className="self-start">{t("winback.save")}</SubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          <Section title={t("lead.contactTitle")}>
            <form action={log} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {contactOutcomes.map((outcome) => (
                <SubmitButton key={outcome} keepLabel variant="outline" name="outcome" value={outcome}>
                  {t(`outcome.${outcome}` as MessageKey)}
                </SubmitButton>
              ))}
            </form>
          </Section>

          <Section title={t("lead.moveTo")}>
            <div className="flex flex-wrap gap-2">
              {stages
                .filter((s) => s.kind !== "cold" && s.key !== lead.stage)
                .map((s) => (
                  <form key={s.key} action={move}>
                    <input type="hidden" name="stage" value={s.key} />
                    <SubmitButton variant={s.kind === "won" ? "secondary" : "outline"} pendingLabel={t("lead.moving")}>
                      {s.name}
                    </SubmitButton>
                  </form>
                ))}
            </div>
            {coldStages
              .filter((s) => s.key !== lead.stage)
              .map((s) => (
                <details key={s.key} className="group rounded-md border border-border">
                  <summary className="label-caps flex min-h-11 cursor-pointer list-none items-center px-4 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring">
                    {s.name}
                  </summary>
                  <form action={move} className="flex flex-col gap-3 border-t border-border p-4">
                    <input type="hidden" name="stage" value={s.key} />
                    <fieldset className="flex flex-col gap-1">
                      <legend className="mb-2 text-base font-medium">{t("lead.coldReasonLabel")}</legend>
                      <RadioGroup name="coldReason" required className="gap-1">
                        {reasons.map((r) => (
                          <Label key={r.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-base font-normal hover:bg-accent/60">
                            <RadioGroupItem value={r.key} />
                            {r.name}
                          </Label>
                        ))}
                      </RadioGroup>
                    </fieldset>
                    <SubmitButton className="self-start">{t("lead.coldSubmit")}</SubmitButton>
                  </form>
                </details>
              ))}
          </Section>

          <Section title={t("task.title")}>
            <TaskForm leadId={lead.id} today={today} />
            {taskLists.open.length === 0 ? (
              <p className="text-muted-foreground">{t("task.noOpen")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {taskLists.open.map((task) => {
                  const state = dueState(task.dueDate, today);
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-md border border-l-4 border-border p-3 sm:flex-row sm:items-center sm:justify-between",
                        state === "overdue" ? "border-l-destructive bg-danger-surface/50" : state === "today" ? "border-l-[#d99a1e]" : "border-l-border",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="break-words">{task.title}</p>
                        <p
                          className={cn(
                            "text-sm",
                            state === "overdue" ? "font-medium text-danger-text" : state === "today" ? "font-medium text-warning-text" : "text-muted-foreground",
                          )}
                        >
                          {state === "overdue" && `${t("task.overdue")} · `}
                          {state === "today" ? t("task.today") : formatDay(task.dueDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <form action={finishTask.bind(null, lead.id, task.id, true)}>
                          <SubmitButton size="sm" variant="secondary">
                            {t("task.done")}
                          </SubmitButton>
                        </form>
                        <form action={removeTask.bind(null, lead.id, task.id)}>
                          <ConfirmButton size="sm" variant="ghost" confirmLabel={t("task.confirmDelete")}>
                            {t("task.delete")}
                          </ConfirmButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {taskLists.done.length > 0 && (
              <details className="rounded-md">
                <summary className="label-caps min-h-11 cursor-pointer py-2 text-muted-foreground hover:text-foreground">{t("task.doneTitle")}</summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {taskLists.done.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 text-muted-foreground">
                      <span className="min-w-0">
                        <span className="line-through break-words">{task.title}</span>
                        {task.doneAt && <span className="block text-sm">{t("task.doneBy", { when: formatDateTime(task.doneAt) })}</span>}
                      </span>
                      <form action={finishTask.bind(null, lead.id, task.id, false)}>
                        <SubmitButton size="sm" variant="ghost">
                          {t("task.undo")}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section title={t("lead.notes")}>
            <NoteForm leadId={lead.id} />
            {history.length === 0 ? (
              <p className="text-muted-foreground">{t("lead.noNotes")}</p>
            ) : (
              <ol className="flex flex-col">
                {history.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="relative flex gap-3 pb-4 last:pb-0">
                    <HistoryIcon item={item} />
                    <div className="min-w-0 flex-1 border-b border-border pb-4 last:border-0">
                      <HistoryLine item={item} stageName={stageName} reasonName={reasonName} />
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.authorName ? `${item.authorName} · ` : ""}
                        {formatDateTime(item.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24">
          <Section title={t("lead.mana")}>
            {!mana ? (
              <p className="text-muted-foreground">{t("lead.manaNone")}</p>
            ) : mana.memberships.length === 0 ? (
              <p className="text-muted-foreground">{t("lead.manaNoMembership")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mana.memberships.map((m) => {
                  const counts = !mana.ignored.includes(m.membershipId);
                  return (
                    <li key={m.id} className="rounded-md border border-border p-3">
                      <p className="font-medium">
                        {m.name}{" "}
                        <span className={cn("label-caps ml-1 text-sm", m.status === "active" ? "text-success-text" : "text-muted-foreground")}>
                          {t(`mstatus.${m.status}` as MessageKey)}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {m.status === "future"
                          ? t("lead.manaStarts", { date: formatDay(m.startDate) })
                          : m.status === "ended"
                            ? m.pendingChangeDate
                              ? t("lead.manaEnded", { date: formatDay(m.pendingChangeDate) })
                              : ""
                            : t("lead.manaSince", { date: formatDay(m.startDate) })}
                        {m.status !== "ended" && m.pendingChangeKind === "cancel" && m.pendingChangeDate
                          ? ` · ${t("lead.manaCancel", { date: formatDay(m.pendingChangeDate) })}`
                          : ""}
                        {m.pendingChangeKind === "freeze" && m.pendingChangeDate
                          ? ` · ${t("lead.manaFreeze", { date: formatDay(m.pendingChangeDate) })}`
                          : ""}
                      </p>
                      {!counts && <p className="text-sm text-muted-foreground">{t("lead.manaNotCounted")}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t("assign.title")}>
            <form action={assignAction.bind(null, lead.id)} className="flex flex-col gap-3">
              <Label htmlFor="assignee" className="sr-only">
                {t("assign.title")}
              </Label>
              <NativeSelect id="assignee" name="assignee" defaultValue={lead.assignedToId ?? ""}>
                <option value="">{t("assign.none")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
              <SubmitButton variant="outline" className="self-start">
                {t("assign.save")}
              </SubmitButton>
            </form>
          </Section>

          <Section title={t("lead.details")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">{t("lead.stage")}</dt>
              <dd>
                {stage.name}
                {lead.coldReason && (
                  <span className="block text-sm text-muted-foreground">{t("lead.coldWhy", { reason: reasonName(lead.coldReason) })}</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("lead.source")}</dt>
              <dd>{t(`source.${lead.source}` as MessageKey)}</dd>
              <dt className="text-muted-foreground">{t("lead.created")}</dt>
              <dd className="tabular-nums">{formatDateTime(lead.createdAt)}</dd>
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function HistoryIcon({ item }: { item: HistoryItem }) {
  const Icon = item.kind === "note" ? MessageSquare : item.kind === "contact_logged" ? PhoneCall : ArrowRight;
  return (
    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

function HistoryLine({
  item,
  stageName,
  reasonName,
}: {
  item: HistoryItem;
  stageName: (key: string | null) => string;
  reasonName: (key: string | null) => string;
}) {
  if (item.kind === "note") return <p className="break-words whitespace-pre-wrap">{item.body}</p>;
  if (item.kind === "contact_logged") {
    return <p>{t("history.contact", { outcome: t(`outcome.${item.outcome}` as MessageKey) })}</p>;
  }
  return (
    <div>
      <p>
        {item.fromStage
          ? t("history.stageChanged", { from: stageName(item.fromStage), to: stageName(item.toStage) })
          : t("history.stageStart", { to: stageName(item.toStage) })}
      </p>
      {item.coldReason && <p className="text-muted-foreground">{t("history.coldBecause", { reason: reasonName(item.coldReason) })}</p>}
      {item.via === "mana" && <p className="text-muted-foreground">{t("history.viaMana")}</p>}
    </div>
  );
}
