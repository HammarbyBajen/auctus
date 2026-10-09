import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wordmark } from "@/components/app/wordmark";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-primary px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <Wordmark className="text-4xl text-white sm:text-5xl" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="label-caps text-xl">{t("login.title")}</CardTitle>
          <CardDescription className="text-base">{t("login.intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
