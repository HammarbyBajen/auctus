import { Mark } from "@/components/app/mark";
import { Notice } from "@/components/app/notice";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/db";
import { inviteFor } from "@/lib/users/service";
import { t } from "@/lib/i18n";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

/** Where a new user, or one who forgot their password, chooses a password from a personal link (ticket 14). */
export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await inviteFor(db, token) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Mark size="lg" />
        {invite ? (
          <>
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tighter text-balance">{t("welcome.title", { name: invite.name.split(" ")[0] })}</h1>
              <p className="text-sm text-muted-foreground">{t("welcome.intro", { email: invite.email })}</p>
            </div>
            <WelcomeForm token={token} email={invite.email} />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <Notice tone="warning">{t("welcome.expired")}</Notice>
            <ButtonLink href="/login" variant="outline" className="self-start">
              {t("welcome.toLogin")}
            </ButtonLink>
          </div>
        )}
      </div>
    </main>
  );
}
