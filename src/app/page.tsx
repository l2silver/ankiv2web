import { ApiAppGate } from "@/components/ApiAppGate";
import { HomePage } from "@/components/HomePage";

export default function Page() {
  return (
    <ApiAppGate>
      <HomePage />
    </ApiAppGate>
  );
}
