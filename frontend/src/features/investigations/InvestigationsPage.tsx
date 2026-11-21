import { useParams } from "react-router";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { Composer } from "./Composer";
import { HistoryList } from "./HistoryList";
import { InvestigationDetail } from "./InvestigationDetail";

export function InvestigationsPage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Investigate" subtitle={id ? `Investigation ${id.slice(0, 8)}` : "Paste an error, an id or a question"} />
      <PageBody>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <HistoryList />
          {id ? <InvestigationDetail key={id} id={id} /> : <Composer />}
        </div>
      </PageBody>
    </>
  );
}
