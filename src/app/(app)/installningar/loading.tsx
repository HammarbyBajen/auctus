import { PageSkeleton } from "@/components/app/page-skeleton";

/** Shown at once while settings loads. */
export default function Loading() {
  return <PageSkeleton shape="panels" />;
}
