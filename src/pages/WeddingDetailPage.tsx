import { Link, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { WeddingDetailSkeleton } from "../components/DashboardSkeleton";
import { WEDDING_THREAD_DRAFT_DEFAULT } from "../data/weddingThreads";
import { MotionTabContent } from "../components/motion-primitives";
import { getTravelForWedding } from "../data/weddingTravel";
import { InlineReplyFooter } from "../components/wedding-detail/InlineReplyFooter";
import { OtherWeddingsCard } from "../components/wedding-detail/OtherWeddingsCard";
import { StoryNotesCard } from "../components/wedding-detail/StoryNotesCard";
import { TimelineTab } from "../components/wedding-detail/TimelineTab";
import { WeddingAttachmentsCard } from "../components/wedding-detail/WeddingAttachmentsCard";
import { WeddingComposerModal } from "../components/wedding-detail/WeddingComposerModal";
import { WeddingDetailTabContent } from "../components/wedding-detail/WeddingDetailTabContent";
import { WeddingLogisticsCard } from "../components/wedding-detail/WeddingLogisticsCard";
import { WeddingOverviewCard } from "../components/wedding-detail/WeddingOverviewCard";
import { WeddingPeopleCard } from "../components/wedding-detail/WeddingPeopleCard";
import { WeddingTabs } from "../components/wedding-detail/WeddingTabs";
import { useTimedToast } from "../hooks/useTimedToast";
import { useSendMessage } from "../hooks/useSendMessage";
import { useWeddingProject, type ThreadWithDrafts, type ProjectTask } from "../hooks/useWeddingProject";
import { useWeddingComposer } from "../hooks/useWeddingComposer";
import { useWeddingDetailState } from "../hooks/useWeddingDetailState";
import { useWeddingTabState } from "../hooks/useWeddingTabState";
import { useWeddingThreads } from "../hooks/useWeddingThreads";
import type { WeddingEntry } from "../data/weddingCatalog";
import type { Tables } from "../types/database.types";

export function mapRowToEntry(row: Tables<"weddings">): WeddingEntry {
  const d = new Date(row.wedding_date);
  const when = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const fmt = (v: number | null) =>
    v == null
      ? "\u2014"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(v);

  const stage = row.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    couple: row.couple_names,
    when,
    where: row.location,
    stage,
    package: row.package_name ?? "\u2014",
    value: fmt(row.contract_value),
    balance: fmt(row.balance_due),
    story: row.story_notes ?? "",
  };
}

const DRAFT_DEFAULT = WEDDING_THREAD_DRAFT_DEFAULT;

export function WeddingDetailInner({
  weddingId,
  entry,
  photographerId,
  clients,
  liveThreads,
  liveTasks,
}: {
  weddingId: string;
  entry: WeddingEntry;
  photographerId: string;
  clients: Tables<"clients">[];
  liveThreads: ThreadWithDrafts[];
  liveTasks: ProjectTask[];
}) {

  const { toast, showToast } = useTimedToast();
  const { sendMessage } = useSendMessage();
  const travelPlan = getTravelForWedding(weddingId);
  const { tab, setTabAndUrl } = useWeddingTabState();
  const detailState = useWeddingDetailState({ weddingId, entry, liveClients: clients, showToast });
  const threadState = useWeddingThreads({ weddingId, photographerId, liveThreads, showToast });
  const composerState = useWeddingComposer({
    activeThread: threadState.activeThread,
    people: detailState.people,
    draftPendingByThread: threadState.draftPendingByThread,
    draftDefault: threadState.draftDefault ?? DRAFT_DEFAULT,
    selectedThreadId: threadState.selectedThreadId,
    photographerId,
    sendMessage,
    showToast,
  });

  return (
    <div className="relative grid min-h-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:items-start">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-full border border-border bg-surface px-5 py-2.5 type-small text-ink">
          {toast}
        </div>
      ) : null}

      <aside className="space-y-4">
        <WeddingOverviewCard
          weddingFields={detailState.weddingFields}
          editingWedding={detailState.editingWedding}
          setWeddingFields={detailState.setWeddingFields}
          startEditWedding={detailState.startEditWedding}
          cancelEditWedding={detailState.cancelEditWedding}
          saveEditWedding={detailState.saveEditWedding}
        />
        <WeddingPeopleCard
          people={detailState.people}
          editingPeople={detailState.editingPeople}
          startEditPeople={detailState.startEditPeople}
          cancelEditPeople={detailState.cancelEditPeople}
          saveEditPeople={detailState.saveEditPeople}
          addPersonRow={detailState.addPersonRow}
          removePersonRow={detailState.removePersonRow}
          updatePerson={detailState.updatePerson}
        />
        <WeddingLogisticsCard onOpenTravel={() => setTabAndUrl("travel")} />
      </aside>

      <section className="flex h-[min(720px,calc(100dvh-10rem))] min-h-[400px] flex-col overflow-hidden rounded-lg border border-border bg-surface xl:h-[min(720px,calc(100dvh-11rem))]">
        <WeddingTabs tab={tab} setTabAndUrl={setTabAndUrl} />

        <AnimatePresence mode="wait" initial={false}>
          {tab === "timeline" ? (
            <MotionTabContent tabKey="timeline" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TimelineTab
                activeThread={threadState.activeThread}
                threads={threadState.threads}
                earlierMessages={threadState.earlierMessages}
                todayMessages={threadState.todayMessages}
                messageExpanded={threadState.messageExpanded}
                defaultExpandedForMessage={threadState.defaultExpandedForMessage}
                toggleMessage={threadState.toggleMessage}
                setSelectedThreadId={threadState.setSelectedThreadId}
                showDraft={threadState.showDraft}
                draftExpanded={threadState.draftExpanded}
                toggleDraftExpanded={threadState.toggleDraftExpanded}
                approveDraft={threadState.approveDraft}
                isApprovingDraft={threadState.approvingDraftId !== null}
                editDraftInComposer={composerState.editDraftInComposer}
                draftDefault={threadState.draftDefault ?? DRAFT_DEFAULT}
              />
            </MotionTabContent>
          ) : (
            <MotionTabContent tabKey={tab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WeddingDetailTabContent
                tab={tab}
                threads={threadState.threads}
                setSelectedThreadId={threadState.setSelectedThreadId}
                setTabAndUrl={setTabAndUrl}
                showToast={showToast}
                weddingId={weddingId}
                travelPlan={travelPlan}
                tasks={liveTasks}
              />
            </MotionTabContent>
          )}
        </AnimatePresence>

        <InlineReplyFooter
          replyMeta={composerState.replyMeta}
          replyScope={composerState.replyScope}
          applyReplyScope={composerState.applyReplyScope}
          replyAreaRef={composerState.replyAreaRef}
          replyBody={composerState.replyBody}
          setReplyBody={composerState.setReplyBody}
          submitInlineForApproval={composerState.submitInlineForApproval}
          isInternalNote={composerState.isInternalNote}
          toggleInternalNote={composerState.toggleInternalNote}
          generateInlineResponse={composerState.generateInlineResponse}
          showToast={showToast}
        />
      </section>

      <aside className="space-y-4">
        <StoryNotesCard
          story={entry.story}
          summaryBusy={detailState.summaryBusy}
          regenerateSummary={detailState.regenerateSummary}
          photographerNotes={detailState.photographerNotes}
          setPhotographerNotes={detailState.setPhotographerNotes}
        />
        <WeddingAttachmentsCard />
        <OtherWeddingsCard />
      </aside>

      {composerState.composerOpen ? (
        <WeddingComposerModal
          composerKind={composerState.composerKind}
          weddingCouple={detailState.weddingFields.couple}
          closeComposer={composerState.closeComposer}
          to={composerState.to}
          setTo={composerState.setTo}
          cc={composerState.cc}
          setCc={composerState.setCc}
          subject={composerState.subject}
          setSubject={composerState.setSubject}
          body={composerState.body}
          setBody={composerState.setBody}
          requestAiDraft={composerState.requestAiDraft}
          sendComposer={composerState.sendComposer}
          showToast={showToast}
          internalBody={composerState.internalBody}
          setInternalBody={composerState.setInternalBody}
        />
      ) : null}
    </div>
  );
}

export function WeddingDetailPage() {
  const { weddingId } = useParams();
  const { project, timeline, tasks, isLoading, error } = useWeddingProject(weddingId);

  if (isLoading) {
    return <WeddingDetailSkeleton />;
  }

  if (!weddingId || error || !project) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        <p className="type-body font-semibold text-ink">Wedding not found</p>
        <p className="max-w-md text-center type-small text-ink-muted">This project doesn\u2019t exist or was removed.</p>
        <Link to="/weddings" className="type-small font-semibold text-link hover:text-link-hover">
          \u2190 Back to Weddings
        </Link>
      </div>
    );
  }

  return (
    <WeddingDetailInner
      weddingId={weddingId}
      entry={mapRowToEntry(project)}
      photographerId={project.photographer_id}
      clients={project.clients}
      liveThreads={timeline}
      liveTasks={tasks}
    />
  );
}
