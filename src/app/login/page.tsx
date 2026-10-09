import { Mark } from "@/components/app/mark";
import { Stagger, StaggerItem } from "@/components/app/stagger";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";
import { ProductView } from "./product-view";

/** Tier 1 signature screen: display type, a staggered entrance, the product dimmed beside the form. */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <Stagger className="flex flex-col justify-center gap-8 px-6 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-12">
        <StaggerItem>
          <Mark size="lg" />
        </StaggerItem>
        <StaggerItem className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">{t("login.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("login.intro")}</p>
        </StaggerItem>
        <StaggerItem className="w-full max-w-sm">
          <LoginForm />
        </StaggerItem>
      </Stagger>
      <div className="h-72 px-6 pb-8 sm:px-12 lg:h-auto lg:py-10 lg:pr-10 lg:pl-0">
        <div className="h-full opacity-70 lg:opacity-80">
          <ProductView />
        </div>
      </div>
    </main>
  );
}
