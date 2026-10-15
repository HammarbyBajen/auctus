import { Chip } from "@/components/app/chip";
import { formatDateTime } from "@/lib/format";
import type { listEmails } from "@/lib/email/service";
import { t, type MessageKey } from "@/lib/i18n";

type Row = Awaited<ReturnType<typeof listEmails>>[number];

const tone = (status: string) =>
  status === "bounced" || status === "complained" || status === "failed" || status === "suppressed" ? "destructive" : status === "delayed" ? "warning" : "neutral";

/** The emails sent from Tegen HQ to one person, newest first, with how each went. */
export function EmailHistory({ emails }: { emails: Row[] }) {
  if (emails.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("email.history")}</h3>
      <ul className="flex flex-col divide-y divide-border">
        {emails.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 py-2 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium break-words">{e.subject}</span>
              <Chip tone={tone(e.status)}>{e.mode === "live" ? t(`email.status.${e.status}` as MessageKey) : t(`email.status.${e.mode}` as MessageKey)}</Chip>
            </div>
            <p className="text-xs text-muted-foreground">
              {e.sentBy ? `${e.sentBy} · ` : ""}
              {formatDateTime(e.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
