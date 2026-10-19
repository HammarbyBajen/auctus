import { PageSkeleton } from "@/components/app/page-skeleton";

/** Shown at once while the leads board loads. */
export default function Loading() {
  return <PageSkeleton shape="board" />;
}
