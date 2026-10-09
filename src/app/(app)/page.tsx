import Link from "next/link";
import { requireUser } from "@/lib/session";
import { t } from "@/lib/i18n";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ fel?: string }>;
}) {
  const user = await requireUser();
  const { fel } = await searchParams;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("home.greeting", { name: user.name })}</h1>
      {fel === "behorighet" && (
        <p role="alert" className="rounded-lg bg-amber-100 px-4 py-3">
          {t("home.noAccess")}
        </p>
      )}
      <p className="text-lg text-stone-700">{t("home.empty")}</p>
      <Link href="/leads" className="text-lg underline">
        {t("nav.leads")}
      </Link>
    </main>
  );
}
