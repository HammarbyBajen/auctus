import { PageSkeleton } from "@/components/app/page-skeleton";

/** Shown at once while Handbok loads. */
export default function Loading() {
  return <PageSkeleton shape="table" />;
}
