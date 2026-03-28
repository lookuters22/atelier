import { Link, useParams } from "react-router-dom";
import { resolveWeddingEntry } from "../data/weddingRegistry";
import { WEDDING_THREAD_DRAFT_DEFAULT } from "../data/weddingThreads";
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
import { useWeddingComposer } from "../hooks/useWeddingComposer";
import { useWeddingDetailState } from "../hooks/useWeddingDetailState";
import { useWeddingTabState } from "../hooks/useWeddingTabState";
import { useWeddingThreads } from "../hooks/useWeddingThreads";

const DRAFT_DEFAULT = WEDDING_THREAD_DRAFT_DEFAULT;

function WeddingDetailInner({
  weddingId,
  entry,
}: {
  weddingId: string;
  entry: NonNullable<ReturnType<typeof resolveWeddingEntry>>;
}) {

  const { toast, showToast } = useTimedToast();
  const travelPlan = getTravelForWedding(weddingId);
  const { tab, setTabAndUrl } = useWeddingTabState();
  const detailState = useWeddingDetailState({ weddingId, entry, showToast });
  const threadState = useWeddingThreads({ weddingId, showToast });
  const composerState = useWeddingComposer({
    activeThread: threadState.activeThread,
    people: detailState.people,
    draftPendingByThread: threadState.draftPendingByThread,
    draftDefault: DRAFT_DEFAULT,
    selectedThreadId: threadState.selectedThreadId,
    showToast,
  });

  return (
    <div className="relative grid min-h-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:items-start">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-full border border-border bg-surface px-5 py-2.5 text-[13px] font-medium text-ink ring-1 ring-black/[0.06]">
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

      <section className="flex h-[min(720px,calc(100dvh-10rem))] min-h-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-surface xl:h-[min(720px,calc(100dvh-11rem))]">
        <WeddingTabs tab={tab} setTabAndUrl={setTabAndUrl} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "timeline" ? (
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
              editDraftInComposer={composerState.editDraftInComposer}
              draftDefault={DRAFT_DEFAULT}
            />
          ) : null}

          {tab !== "timeline" ? (
            <WeddingDetailTabContent
              tab={tab}
              threads={threadState.threads}
              setSelectedThreadId={threadState.setSelectedThreadId}
              setTabAndUrl={setTabAndUrl}
              showToast={showToast}
              weddingId={weddingId}
              travelPlan={travelPlan}
            />
          ) : null}
        </div>

        <InlineReplyFooter
          replyMeta={composerState.replyMeta}
          replyScope={composerState.replyScope}
          applyReplyScope={composerState.applyReplyScope}
          replyAreaRef={composerState.replyAreaRef}
          replyBody={composerState.replyBody}
          setReplyBody={composerState.setReplyBody}
          submitInlineForApproval={composerState.submitInlineForApproval}
          openInternalComposer={() => composerState.openComposer("internal")}
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
  const entry = weddingId ? resolveWeddingEntry(weddingId) : null;

  if (!weddingId || !entry) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-[15px] font-semibold text-ink">Wedding not found</p>
        <p className="max-w-md text-center text-[13px] text-ink-muted">This project doesnâ€™t exist or was removed.</p>
        <Link to="/weddings" className="text-[13px] font-semibold text-accent hover:text-accent-hover">
          â† Back to Weddings
        </Link>
      </div>
    );
  }

  return <WeddingDetailInner weddingId={weddingId} entry={entry} />;
}
