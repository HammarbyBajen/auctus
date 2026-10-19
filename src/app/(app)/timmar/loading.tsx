import { PageSkeleton } from "@/components/app/page-skeleton";

/** Shown at once while the month's hours load. */
export default function Loading() {
  return <PageSkeleton shape="table" />;
}
