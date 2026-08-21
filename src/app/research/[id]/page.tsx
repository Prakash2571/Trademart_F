'use client';

/**
 * /research/[id] - one candidate, with the reasoning behind its score.
 *
 * The detail IS the product. An operator who disagrees with a score needs the figure that
 * drove it, which factor was excluded and why, and where each number came from. A page
 * that showed only a verdict would be asking for trust it has not earned.
 *
 * WHAT THIS PAGE DELIBERATELY DOES NOT HAVE
 * ----------------------------------------
 * Any control that publishes. [Push as Draft] creates a DRAFT in Shopify and nothing
 * more; publishing is a separate deliberate act performed in Shopify by someone who has
 * read the listing. There is no [Auto Publish], and there is no "publish after push"
 * checkbox.
 */

import { useCallback, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import {
  DuplicateList,
  EvidenceList,
  FactorTable,
  FreshnessBadge,
  RecommendationBadge,
  ScenarioTable,
  ScorePair,
  SeasonBadge,
  formatSearchVolume,
} from '@/components/ResearchUi';
import {
  Badge,
  Callout,
  Card,
  ErrorCallout,
  KeyValue,
  Modal,
  PageHeader,
  SkeletonStats,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPost } from '@/lib/api';
import { formatAmount, formatDate, formatDateTime } from '@/lib/format';
import type {
  AnalyzeResult,
  DuplicateReport,
  PricingScenarioName,
  ProductCandidate,
  PushAsDraftResult,
} from '@/lib/types';

const SCENARIOS: PricingScenarioName[] = ['CONSERVATIVE', 'BALANCED', 'PREMIUM'];

export default function CandidatePage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';

  const candidate = useApi<ProductCandidate>(
    id === '' ? null : `/intelligence/candidates/${encodeURIComponent(id)}`,
    [id],
  );
  const duplicates = useApi<DuplicateReport>(
    id === '' ? null : `/intelligence/candidates/${encodeURIComponent(id)}/duplicates`,
    [id],
  );

  /** Set by an analyse run. Carries the pricing and provenance the stored score lacks. */
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [pushed, setPushed] = useState<PushAsDraftResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [scenario, setScenario] = useState<PricingScenarioName>('BALANCED');
  const [pushOpen, setPushOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchUntil, setWatchUntil] = useState('');

  const meta = candidate.meta as { scoreIsStale?: boolean; note?: string | null } | undefined;
  const data = candidate.data;

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setBusy(label);
      setActionError(null);
      try {
        await action();
      } catch (caught: unknown) {
        setActionError(
          caught instanceof ApiError
            ? caught
            : new ApiError('UNKNOWN', 'The action failed.', 0),
        );
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const analyse = () =>
    run('analyse', async () => {
      const result = await apiPost<AnalyzeResult>(
        `/intelligence/candidates/${encodeURIComponent(id)}/analyze`,
        { scenario },
      );
      setAnalysis(result.data);
      candidate.refetch();
      duplicates.refetch();
    });

  const push = (allowDuplicate: boolean) =>
    run('push', async () => {
      const result = await apiPost<PushAsDraftResult>(
        `/intelligence/candidates/${encodeURIComponent(id)}/push`,
        { scenario, allowDuplicate },
      );
      setPushed(result.data);
      setPushOpen(false);
      candidate.refetch();
    });

  const reject = () =>
    run('reject', async () => {
      await apiPost(`/intelligence/candidates/${encodeURIComponent(id)}/reject`, {
        reason: rejectReason.trim(),
      });
      setRejectOpen(false);
      setRejectReason('');
      candidate.refetch();
    });

  const watch = () =>
    run('watch', async () => {
      await apiPost(`/intelligence/candidates/${encodeURIComponent(id)}/watch`, {
        watchUntil: new Date(`${watchUntil}T00:00:00.000Z`).toISOString(),
      });
      setWatchOpen(false);
      candidate.refetch();
    });

  const pricing = analysis?.pricing ?? null;
  const alreadyPushed = data?.pushedShopifyProductId ?? null;

  return (
    <>
      <PageHeader
        title={data?.title ?? 'Candidate'}
        description={
          data === null
            ? undefined
            : `Recorded ${formatDate(data.createdAt)}${data.category === null ? '' : ` · ${data.category}`} · target ${data.market.countryCode}${data.market.region === null ? '' : ` / ${data.market.region}`}`
        }
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/research" className="btn btn--sm">
              Back to shortlist
            </Link>
          </div>
        }
      />

      {candidate.error !== null && <ErrorCallout error={candidate.error} />}
      {actionError !== null && <ErrorCallout error={actionError} />}
      {candidate.loading && <SkeletonStats count={3} />}

      {data !== null && (
        <>
          {/* ---- the verdict ------------------------------------------- */}
          <Card
            title="Verdict"
            actions={<RecommendationBadge recommendation={data.recommendation} />}
          >
            <ScorePair
              overallScore={data.overallScore}
              confidenceScore={data.confidenceScore}
            />

            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <SeasonBadge state={data.seasonState} />
              <FreshnessBadge freshness={data.freshness} />
              {data.analyzedAt !== null && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Analysed {formatDateTime(data.analyzedAt)}
                </span>
              )}
            </div>

            {data.analyzedAt === null && (
              <Callout tone="info" title="Never analysed">
                {meta?.note ??
                  'This candidate has no score yet. That is not a low score — analyse it to produce one.'}
              </Callout>
            )}

            {meta?.scoreIsStale === true && (
              <Callout tone="warning" title="The stored score is out of date">
                The candidate has been edited since it was last analysed, so the score above
                was computed from different figures. Re-analyse before acting on it.
              </Callout>
            )}

            {data.reasons.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  How the score was built
                </div>
                <ul className="note-list">
                  {data.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.risks.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Risks — read these before committing money
                </div>
                <ul className="note-list">
                  {data.risks.map((risk, index) => (
                    <li key={index}>
                      <Badge tone="warning">risk</Badge> {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ---- actions ------------------------------------------------ */}
          <Card title="Actions">
            <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="muted" htmlFor="rc-scenario" style={{ fontSize: 12 }}>
                Price scenario
              </label>
              <select
                id="rc-scenario"
                className="select"
                value={scenario}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setScenario(event.target.value as PricingScenarioName)
                }
              >
                {SCENARIOS.map((name) => (
                  <option key={name} value={name}>
                    {name.charAt(0) + name.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn--sm"
                onClick={analyse}
                disabled={busy !== null}
              >
                {busy === 'analyse' ? 'Analysing…' : 'Analyse'}
              </button>

              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setWatchOpen(true)}
                disabled={busy !== null}
              >
                Watch
              </button>

              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setRejectOpen(true)}
                disabled={busy !== null || data.status === 'REJECTED'}
              >
                Reject
              </button>

              {/*
                The only path from research into Shopify, and it creates a DRAFT.
                There is deliberately no publish control anywhere on this page.
              */}
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setPushOpen(true)}
                disabled={busy !== null || alreadyPushed !== null}
                title={
                  alreadyPushed === null
                    ? 'Creates an unpublished DRAFT product in Shopify'
                    : `Already pushed as ${alreadyPushed}. Pushing again would duplicate it.`
                }
              >
                Push as Draft
              </button>
            </div>

            <p className="muted" style={{ fontSize: 12 }}>
              Push as Draft creates an <strong>unpublished</strong> Shopify product. Nothing
              here publishes — review the draft in Shopify and publish it there when you are
              ready.
            </p>

            {alreadyPushed !== null && (
              <Callout tone="info" title="Already a draft in Shopify">
                This candidate was pushed as{' '}
                <span className="mono">{alreadyPushed}</span>. It is a draft, not a published
                product. Edit it in Shopify rather than pushing again.
              </Callout>
            )}
          </Card>

          {/* ---- push result ------------------------------------------- */}
          {pushed !== null && (
            <Card title="Draft created">
              <Callout tone="success" title="A DRAFT was created — nothing is published">
                Shopify product <span className="mono">{pushed.product.shopifyProductId}</span>{' '}
                with status <strong>{pushed.product.status}</strong>, listed at{' '}
                {formatAmount(pushed.listedPrice.amount, pushed.listedPrice.currencyCode)} (
                {pushed.listedPrice.source}).
              </Callout>

              <KeyValue
                items={[
                  {
                    key: 'Visible to customers',
                    value: pushed.product.visibleToCustomers ? (
                      <Badge tone="danger">yes — check this</Badge>
                    ) : (
                      <Badge tone="success">no</Badge>
                    ),
                  },
                  {
                    key: 'Supplier cost recorded',
                    value: pushed.costRecorded ? (
                      <Badge tone="success">yes</Badge>
                    ) : (
                      <Badge tone="warning">no — margin will show as unknown</Badge>
                    ),
                  },
                ]}
              />

              {pushed.warnings.length > 0 && (
                <ul className="note-list" style={{ marginTop: 10 }}>
                  {pushed.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* ---- pricing ----------------------------------------------- */}
          <Card title="Price recommendation">
            {pricing === null ? (
              <p className="muted" style={{ fontSize: 12 }}>
                Analyse the candidate to compute prices. Scenarios are recalculated each time,
                because a stored price could have been computed against costs or settings that
                have since changed.
              </p>
            ) : pricing.blockedReason !== null ? (
              <Callout tone="warning" title="No price could be computed">
                {pricing.blockedReason}
              </Callout>
            ) : (
              <>
                <KeyValue
                  items={[
                    {
                      key: pricing.shippingIncluded ? 'Landed cost' : 'Supplier cost only',
                      value: (
                        <span className="mono">
                          {formatAmount(pricing.landedCost, pricing.currencyCode)}
                        </span>
                      ),
                    },
                    {
                      key: 'Strategy',
                      value: `${pricing.policy.strategy.replace(/_/g, ' ').toLowerCase()} · floors ${pricing.policy.minimumMarginPercentage}% margin / ${formatAmount(pricing.policy.minimumProfitAmount, pricing.currencyCode)} contribution`,
                    },
                  ]}
                />

                <div style={{ marginTop: 12 }}>
                  <ScenarioTable
                    scenarios={pricing.scenarios}
                    recommended={pricing.recommended}
                    currencyCode={pricing.currencyCode}
                  />
                </div>

                {pricing.warnings.length > 0 && (
                  <ul className="note-list" style={{ marginTop: 10 }}>
                    {pricing.warnings.map((warning, index) => (
                      <li key={index}>
                        <Badge tone="warning">warning</Badge> {warning}
                      </li>
                    ))}
                  </ul>
                )}

                {pricing.notes.length > 0 && (
                  <ul className="note-list" style={{ marginTop: 6 }}>
                    {pricing.notes.map((note, index) => (
                      <li key={index} className="muted">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          {/* ---- factors ----------------------------------------------- */}
          <Card title="Factors" bodyless>
            {data.factors.length === 0 ? (
              <div className="card__body">
                <span className="muted">
                  No factors yet — this candidate has not been analysed.
                </span>
              </div>
            ) : (
              <FactorTable factors={data.factors} />
            )}
          </Card>

          {/* ---- what could not be measured ---------------------------- */}
          {analysis !== null && analysis.unavailable.length > 0 && (
            <Card title="What could not be measured for this candidate">
              <ul className="note-list">
                {analysis.provenance
                  .filter((entry) => !entry.supplied && entry.reason !== null)
                  .map((entry, index) => (
                    <li key={index}>
                      <span className="mono">{entry.capability}</span> — {entry.reason}
                    </li>
                  ))}
              </ul>
              {analysis.warnings.length > 0 && (
                <ul className="note-list" style={{ marginTop: 10 }}>
                  {analysis.warnings.map((warning, index) => (
                    <li key={index}>
                      <Badge tone="warning">warning</Badge> {warning}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* ---- the figures the operator entered ---------------------- */}
          <Card title="Figures you recorded">
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              These are your observations, not measurements Trademart made. Freshness ages
              from the date you read them.
            </p>
            <KeyValue
              items={[
                {
                  key: 'Average monthly searches',
                  value: formatSearchVolume(data.manualResearch.averageMonthlySearches),
                },
                {
                  key: `Trend over ${data.market.horizonDays} days`,
                  value:
                    data.manualResearch.momentumPercentage === null
                      ? 'not recorded'
                      : `${data.manualResearch.momentumPercentage > 0 ? '+' : ''}${data.manualResearch.momentumPercentage}%`,
                },
                {
                  key: 'Competition index',
                  value:
                    data.manualResearch.competitionIndex === null
                      ? 'not recorded'
                      : `${data.manualResearch.competitionIndex}/100`,
                },
                {
                  key: 'These figures describe',
                  value:
                    data.manualResearch.geography.countryCode === null ? (
                      <span
                        className="muted"
                        title="Unstated, so the scorers treat the geography as unknown rather than assuming it matches the target market."
                      >
                        not stated
                      </span>
                    ) : (
                      <span className="mono">
                        {data.manualResearch.geography.countryCode}
                        {data.manualResearch.geography.countryCode.toUpperCase() !==
                        data.market.countryCode.toUpperCase() ? (
                          <>
                            {' '}
                            <Badge tone="danger" title="A figure for a different country is DISCARDED rather than down-weighted — data about another market is not weak evidence, it is no evidence.">
                              not the target market
                            </Badge>
                          </>
                        ) : null}
                      </span>
                    ),
                },
                {
                  key: 'Read on',
                  value:
                    data.manualResearch.observedAt === null ? (
                      <span className="muted">not recorded</span>
                    ) : (
                      formatDate(data.manualResearch.observedAt)
                    ),
                },
                {
                  key: 'Source',
                  value: data.manualResearch.sourceNote ?? (
                    <span className="muted">not recorded</span>
                  ),
                },
              ]}
            />
          </Card>

          {/* ---- evidence --------------------------------------------- */}
          <Card title="Evidence" bodyless>
            <div className="card__body">
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Every figure the score rests on, with where it came from and how old it is.
              </p>
            </div>
            <EvidenceList evidence={data.evidence} />
          </Card>

          {/* ---- duplicates ------------------------------------------- */}
          <Card title="Possible duplicates">
            {duplicates.error !== null && <ErrorCallout error={duplicates.error} />}
            {duplicates.data !== null && (
              <>
                {duplicates.data.summary !== null && (
                  <Callout
                    tone={duplicates.data.blocking.length > 0 ? 'warning' : 'info'}
                    title={
                      duplicates.data.blocking.length > 0
                        ? 'A push would be blocked'
                        : 'Nothing blocking'
                    }
                  >
                    {duplicates.data.summary}
                  </Callout>
                )}
                <div style={{ marginTop: 10 }}>
                  <DuplicateList matches={duplicates.data.matches} />
                </div>
              </>
            )}
          </Card>

          {/* ---- score history --------------------------------------- */}
          {data.scoreHistory.length > 0 && (
            <Card title="Score history">
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Each analysis is kept. A candidate that scored well months ago and poorly now
                is the signal that the market moved.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Opportunity</th>
                      <th>Confidence</th>
                      <th>Recommendation</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.scoreHistory].reverse().map((entry, index) => (
                      <tr key={`${entry.at}-${index}`}>
                        <td>{formatDateTime(entry.at)}</td>
                        <td className="mono">{entry.overallScore}</td>
                        <td className="mono">{entry.confidenceScore}</td>
                        <td>
                          <RecommendationBadge recommendation={entry.recommendation} />
                        </td>
                        <td className="muted">{entry.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ---- push confirmation ------------------------------------- */}
      {pushOpen && data !== null && (
        <Modal title="Push as Draft" onClose={() => setPushOpen(false)}>
          <p>
            This creates an <strong>unpublished DRAFT</strong> product in Shopify from{' '}
            <strong>{data.title}</strong>, priced from the{' '}
            {scenario.toLowerCase()} scenario. It does not publish anything and customers will
            not see it.
          </p>

          {duplicates.data !== null && duplicates.data.blocking.length > 0 && (
            <Callout tone="warning" title="This looks like a duplicate">
              <DuplicateList matches={duplicates.data.blocking} />
              <p style={{ marginBottom: 0 }}>
                Pushing anyway will create a second product competing with the existing one.
              </p>
            </Callout>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => push(false)}
              disabled={busy !== null}
            >
              {busy === 'push' ? 'Creating draft…' : 'Create draft'}
            </button>

            {duplicates.data !== null && duplicates.data.blocking.length > 0 && (
              // A separate, explicitly labelled button rather than a checkbox: overriding a
              // duplicate block should be a deliberate act, not a box someone ticks past.
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => push(true)}
                disabled={busy !== null}
              >
                Create anyway — it is a different product
              </button>
            )}

            <button type="button" className="btn btn--sm" onClick={() => setPushOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ---- reject ------------------------------------------------ */}
      {rejectOpen && (
        <Modal title="Reject this candidate" onClose={() => setRejectOpen(false)}>
          <p className="muted" style={{ fontSize: 12 }}>
            A reason is required, so nobody researches the same product again in six months
            without knowing why it was dropped.
          </p>
          <textarea
            className="select"
            rows={3}
            value={rejectReason}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setRejectReason(event.target.value)
            }
            placeholder="Margin too thin once shipping is included"
          />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={reject}
              disabled={busy !== null || rejectReason.trim() === ''}
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setRejectOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ---- watch ------------------------------------------------- */}
      {watchOpen && (
        <Modal title="Watch this candidate" onClose={() => setWatchOpen(false)}>
          <p className="muted" style={{ fontSize: 12 }}>
            An end date is required. A watch with no end becomes a list nobody revisits.
          </p>
          <input
            className="select"
            type="date"
            value={watchUntil}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setWatchUntil(event.target.value)}
          />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={watch}
              disabled={busy !== null || watchUntil === ''}
            >
              {busy === 'watch' ? 'Saving…' : 'Watch until this date'}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setWatchOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
