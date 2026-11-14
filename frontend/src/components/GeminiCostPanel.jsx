
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  Calculator,
  Coins,
  Info,
  RefreshCw,
  Wallet,
  TrendingUp,
  IndianRupee,
} from "lucide-react";

import api from "../services/api";

/* =========================================================
   FORMATTERS
========================================================= */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const numberFormatter = new Intl.NumberFormat("en-IN");

function moneyUSD(value) {
  return usdFormatter.format(Number(value) || 0);
}

function moneyINR(value) {
  return inrFormatter.format(Number(value) || 0);
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

/* =========================================================
   ERROR HANDLING
========================================================= */

function readError(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || "Validation error")
      .join(", ");
  }

  return (
    error?.message ||
    "Unable to retrieve AI cost information."
  );
}

/* =========================================================
   COST CARD
========================================================= */

function CostCard({
  title,
  value,
  usdValue,
  detail,
  Icon,
  variant = "default",
}) {
  return (
    <div
      className={`gcost-card ${
        variant === "primary" ? "gcost-primary" : ""
      }`}
    >
      <div className="gcost-card-heading">
        <span>{title}</span>

        <div className="gcost-card-icon">
          <Icon size={19} />
        </div>
      </div>

      <strong className="gcost-card-value">
        {value}
      </strong>

      {usdValue != null && (
        <span className="gcost-card-usd">
          {usdValue}
        </span>
      )}

      <small>{detail}</small>
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function GeminiCostPanel({
  accessToken,
  days = 30,
  onSessionExpired,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  /* -------------------------------------------------------
     FETCH COST FROM FASTAPI
  ------------------------------------------------------- */

  const loadCost = useCallback(
    async (quiet = false, signal) => {
      if (!accessToken) {
        setLoading(false);
        setError(
          "Administrator authentication is required."
        );
        return;
      }

      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await api.get(
          "/designs/management/gemini-cost",
          {
            params: { days },

            headers: {
              Authorization: `Bearer ${accessToken}`,
            },

            signal,
          }
        );

        if (signal?.aborted) {
          return;
        }

        if (
          response.data?.success !== true ||
          !response.data?.summary
        ) {
          throw new Error(
            "Invalid AI cost response from backend."
          );
        }

        setData(response.data);
      } catch (err) {
        if (
          signal?.aborted ||
          err?.code === "ERR_CANCELED"
        ) {
          return;
        }

        if (
          [401, 403].includes(
            err?.response?.status
          )
        ) {
          onSessionExpired?.();
          return;
        }

        setError(readError(err));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, days, onSessionExpired]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadCost(false, controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadCost]);

  /* -------------------------------------------------------
     COST CALCULATIONS
  ------------------------------------------------------- */

  const summary = data?.summary;

  const usdToInr = Number(data?.usd_to_inr);

  const hasConversionRate =
    Number.isFinite(usdToInr) && usdToInr > 0;

  function toINR(usdAmount) {
    if (!hasConversionRate) {
      return "INR rate not configured";
    }

    return moneyINR(
      Number(usdAmount || 0) * usdToInr
    );
  }

  const estimatedTotalUSD = Number(
    summary?.estimated_total_usd || 0
  );

  const estimatedInputUSD = Number(
    summary?.estimated_input_usd || 0
  );

  const estimatedOutputUSD = Number(
    summary?.estimated_output_usd || 0
  );

  const models = data?.models || [];

  const requestsWithoutTokens = Number(
    summary?.requests_without_tokens || 0
  );

  const unpricedModels = data?.unpriced_models || [];

  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

  return (
    <section className="gcost-root">
      {/* HEADING */}

      <div className="gcost-heading">
        <div>
          <span className="gcost-eyebrow">
            AI COST ANALYTICS
          </span>

          <h3>Estimated API Cost</h3>

          <p>
            Monitor estimated AI API expenses
            in Indian Rupees.
          </p>
        </div>

        <button
          type="button"
          className="gcost-refresh"
          disabled={loading || refreshing}
          onClick={() => loadCost(true)}
        >
          <RefreshCw
            size={15}
            className={
              refreshing ? "gcost-spin" : ""
            }
          />

          Refresh Cost
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          className="gcost-error"
          role="alert"
        >
          <AlertCircle size={18} />

          <span>{error}</span>

          <button
            type="button"
            onClick={() => loadCost(true)}
          >
            Retry
          </button>
        </div>
      )}

      {/* LOADING */}

      {loading && !data ? (
        <div className="gcost-loading">
          <RefreshCw
            size={23}
            className="gcost-spin"
          />

          <strong>
            Calculating AI API costs...
          </strong>

          <span>
            Reading your recorded token usage.
          </span>
        </div>
      ) : summary ? (
        <>
          {/* COST SUMMARY */}

          <div className="gcost-cards">
            <CostCard
              title="Total Estimated Cost"
              value={toINR(
                estimatedTotalUSD
              )}
              usdValue={moneyUSD(
                estimatedTotalUSD
              )}
              detail={`Last ${days} days`}
              Icon={Wallet}
              variant="primary"
            />

            <CostCard
              title="Input Token Cost"
              value={toINR(
                estimatedInputUSD
              )}
              usdValue={moneyUSD(
                estimatedInputUSD
              )}
              detail={`${formatNumber(
                summary.input_tokens
              )} input tokens`}
              Icon={Calculator}
            />

            <CostCard
              title="Estimated Output Cost"
              value={toINR(
                estimatedOutputUSD
              )}
              usdValue={moneyUSD(
                estimatedOutputUSD
              )}
              detail={`${formatNumber(
                summary.output_tokens
              )} output tokens`}
              Icon={Coins}
            />
          </div>

          {/* COST INSIGHT */}

          <div className="gcost-insight">
            <div className="gcost-insight-icon">
              <TrendingUp size={19} />
            </div>

            <div>
              <strong>
                AI API Spending Overview
              </strong>

              <p>
                Estimated total for the selected{" "}
                {days}-day period:{" "}
                <b>{toINR(estimatedTotalUSD)}</b>
                {" "}({moneyUSD(estimatedTotalUSD)}).
              </p>
            </div>
          </div>

          {/* MODEL-WISE COST */}

          <div className="gcost-models">
            <div className="gcost-models-heading">
              <div>
                <span className="gcost-eyebrow">
                  MODEL BREAKDOWN
                </span>

                <h4>
                  AI Model-wise Cost
                </h4>
              </div>

              <IndianRupee size={19} />
            </div>

            {models.length === 0 ? (
              <div className="gcost-empty">
                No AI usage records found
                for this period.
              </div>
            ) : (
              models.map((model) => (
                <div
                  key={model.model_name}
                  className="gcost-model-row"
                >
                  <div className="gcost-model-info">
                    <strong>
                      {model.model_name}
                    </strong>

                    <span>
                      {formatNumber(
                        model.requests
                      )} API requests
                    </span>
                  </div>

                  <div className="gcost-model-price">
                    <strong>
                      {model.pricing_available
                        ? toINR(
                            model.estimated_total_usd
                          )
                        : "Pricing unavailable"}
                    </strong>

                    {model.pricing_available && (
                      <small>
                        {moneyUSD(
                          model.estimated_total_usd
                        )}
                      </small>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* PRICING DISCLAIMER */}

          <div className="gcost-notice">
            <Info size={18} />

            <p>
              <strong>
                Estimated cost only.
              </strong>{" "}
              Costs are calculated using your
              configured AI pricing and
              token usage recorded in PostgreSQL.
              The current calculation assumes
              all output tokens use the image-output
              rate. Actual Google billing may
              differ due to output modality,
              missing token metadata, credits,
              discounts, taxes, or rate changes.
            </p>
          </div>

          {/* MISSING TOKENS WARNING */}

          {requestsWithoutTokens > 0 && (
            <div className="gcost-warning">
              <AlertCircle size={17} />

              <span>
                {formatNumber(
                  requestsWithoutTokens
                )} API requests have no reported
                token quantities. Their actual
                costs cannot be determined here.
              </span>
            </div>
          )}

          {/* UNKNOWN MODEL PRICING */}

          {unpricedModels.length > 0 && (
            <div className="gcost-warning">
              <AlertCircle size={17} />

              <span>
                Pricing is unavailable for:
                {" "}
                {unpricedModels.join(", ")}.
                These models are excluded from
                the estimated total.
              </span>
            </div>
          )}

          {/* CURRENCY INFORMATION */}

          <div className="gcost-footer">
            <div className="gcost-currency">
              <IndianRupee size={15} />

              {hasConversionRate ? (
                <span>
                  Conversion rate:
                  {" "}1 USD = ₹
                  {usdToInr.toFixed(4)}
                </span>
              ) : (
                <span>
                  Set GEMINI_COST_USD_TO_INR
                  in backend/.env to display
                  INR values.
                </span>
              )}
            </div>

            <span>
              Currency values are estimates,
              not Google billing invoices.
            </span>
          </div>
        </>
      ) : (
        <div className="gcost-empty">
          AI cost data is not available.
        </div>
      )}

      <style>{GEMINI_COST_STYLES}</style>
    </section>
  );
}

/* =========================================================
   COMPONENT STYLES
========================================================= */

const GEMINI_COST_STYLES = `
.gcost-root {
  width: 100%;
  margin: 0 0 22px;
  color: #18181b;
  font-family: inherit;
}

.gcost-root * {
  box-sizing: border-box;
}

.gcost-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 17px;
}

.gcost-eyebrow {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.gcost-heading h3 {
  margin: 7px 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -.3px;
}

.gcost-heading p {
  margin: 0;
  font-size: 12px;
  color: #71717a;
}

.gcost-refresh {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 10px 13px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  background: #fff;
  color: #3f3f46;
  font-family: inherit;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  transition: .2s ease;
}

.gcost-refresh:hover:not(:disabled) {
  border-color: #fdba74;
  color: #ea580c;
}

.gcost-refresh:disabled {
  opacity: .55;
  cursor: not-allowed;
}

/* CARDS */

.gcost-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 13px;
}

.gcost-card {
  min-width: 0;
  padding: 19px;
  border: 1px solid #eaeaec;
  border-radius: 15px;
  background: #fff;
  transition: .2s ease;
}

.gcost-card:hover {
  border-color: #fdba74;
  transform: translateY(-2px);
}

.gcost-primary {
  background: linear-gradient(
    130deg,
    #292524,
    #111113
  );
  border-color: #292524;
  color: #fff;
}

.gcost-primary:hover {
  border-color: #fb923c;
}

.gcost-card-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.gcost-card-heading > span {
  font-size: 11px;
  font-weight: 700;
  color: #71717a;
}

.gcost-primary .gcost-card-heading > span {
  color: #d4d4d8;
}

.gcost-card-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: #fff7ed;
  color: #ea580c;
}

.gcost-primary .gcost-card-icon {
  color: #fdba74;
  background: rgba(255,255,255,.10);
}

.gcost-card-value {
  display: block;
  font-size: clamp(20px, 2.5vw, 30px);
  font-weight: 800;
  letter-spacing: -.7px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.gcost-card-usd {
  display: block;
  margin-top: 7px;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 650;
}

.gcost-primary .gcost-card-usd {
  color: #fdba74;
}

.gcost-card small {
  display: block;
  margin-top: 13px;
  font-size: 10px;
  color: #a1a1aa;
}

/* INSIGHT */

.gcost-insight {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 15px;
  margin-top: 15px;
  border: 1px solid #fed7aa;
  border-radius: 12px;
  background: #fff7ed;
}

.gcost-insight-icon {
  display: grid;
  place-items: center;
  flex: 0 0 38px;
  height: 38px;
  border-radius: 10px;
  color: #ea580c;
  background: #ffedd5;
}

.gcost-insight strong {
  font-size: 12px;
  color: #9a3412;
}

.gcost-insight p {
  margin: 6px 0 0;
  color: #9a3412;
  font-size: 11px;
  line-height: 1.7;
}

/* MODEL BREAKDOWN */

.gcost-models {
  margin-top: 17px;
  border: 1px solid #eaeaec;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}

.gcost-models-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 17px;
  border-bottom: 1px solid #eaeaec;
}

.gcost-models-heading h4 {
  margin: 6px 0 0;
  font-size: 14px;
  font-weight: 800;
}

.gcost-models-heading > svg {
  color: #ea580c;
}

.gcost-model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 15px 17px;
  border-bottom: 1px solid #f4f4f5;
}

.gcost-model-row:last-child {
  border-bottom: 0;
}

.gcost-model-info,
.gcost-model-price {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gcost-model-info {
  min-width: 0;
}

.gcost-model-info strong {
  color: #27272a;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.gcost-model-info span {
  color: #a1a1aa;
  font-size: 10px;
}

.gcost-model-price {
  text-align: right;
}

.gcost-model-price strong {
  color: #ea580c;
  font-size: 15px;
  font-weight: 800;
}

.gcost-model-price small {
  color: #a1a1aa;
  font-size: 10px;
}

/* DISCLAIMER */

.gcost-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 14px;
  border-radius: 11px;
  background: #f8fafc;
  color: #64748b;
}

.gcost-notice > svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.gcost-notice p {
  margin: 0;
  font-size: 11px;
  line-height: 1.75;
}

.gcost-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px;
  margin-top: 10px;
  border: 1px solid #fde68a;
  border-radius: 10px;
  color: #92400e;
  background: #fffbeb;
  font-size: 11px;
  line-height: 1.6;
}

.gcost-warning svg {
  flex-shrink: 0;
}

.gcost-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 15px;
  color: #a1a1aa;
  font-size: 10px;
}

.gcost-currency {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gcost-currency svg {
  color: #ea580c;
}

/* FEEDBACK */

.gcost-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  margin-bottom: 15px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
}

.gcost-error span {
  flex: 1;
}

.gcost-error button {
  border: 0;
  background: transparent;
  color: #b91c1c;
  font-weight: 800;
  cursor: pointer;
}

.gcost-loading,
.gcost-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  min-height: 160px;
  padding: 20px;
  color: #a1a1aa;
  font-size: 12px;
}

.gcost-loading strong {
  color: #3f3f46;
  font-size: 13px;
}

.gcost-spin {
  animation: gcost-spin .8s linear infinite;
}

@keyframes gcost-spin {
  to {
    transform: rotate(360deg);
  }
}

/* RESPONSIVE */

@media (max-width: 900px) {
  .gcost-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gcost-primary {
    grid-column: span 2;
  }
}

@media (max-width: 600px) {
  .gcost-cards {
    grid-template-columns: 1fr;
  }

  .gcost-primary {
    grid-column: auto;
  }

  .gcost-card {
    padding: 15px;
  }

  .gcost-card-value {
    font-size: 23px;
  }

  .gcost-model-row {
    align-items: flex-start;
  }

  .gcost-model-price {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gcost-spin {
    animation: none;
  }

  .gcost-card {
    transition: none;
  }

  .gcost-card:hover {
    transform: none;
  }
}
`;
