import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/app/native-select";
import { t } from "@/lib/i18n";

export type LeadFieldDef = { key: string; label: string; type: string; options: string[] };

/**
 * The studio's own lead fields (ticket 07) as form inputs, named field_<key>.
 * Text, or a list of choices. Used on the lead page and in the new-lead form.
 */
export function LeadFieldInputs({ fields, values }: { fields: LeadFieldDef[]; values: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        const id = `field-${f.key}`;
        return (
          <div key={f.key} className="flex flex-col gap-2">
            <Label htmlFor={id}>{f.label}</Label>
            {f.type === "choice" ? (
              <NativeSelect id={id} name={`field_${f.key}`} defaultValue={values[f.key] ?? ""}>
                <option value="">{t("fields.none")}</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input id={id} name={`field_${f.key}`} defaultValue={values[f.key] ?? ""} maxLength={500} />
            )}
          </div>
        );
      })}
    </div>
  );
}
