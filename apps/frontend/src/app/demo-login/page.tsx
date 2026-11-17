import { notFound } from "next/navigation";
import DemoLogin from "./DemoLogin";

export default function Page() {
  if (process.env.NEXT_PUBLIC_DEMO !== "true") notFound();
  return <DemoLogin />;
}
