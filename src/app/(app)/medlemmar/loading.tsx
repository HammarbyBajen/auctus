import { PageSkeleton } from "@/components/app/page-skeleton";

/** Shown at once while the members list loads. */
export default function Loading() {
  return <PageSkeleton shape="table" />;
}
