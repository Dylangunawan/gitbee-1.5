import { notFound } from "next/navigation";
import DataDemo from "./DataDemo";

export default function Page() {
  if (process.env.NEXT_PUBLIC_DEMO !== "true") notFound();
  return <DataDemo />;
}
