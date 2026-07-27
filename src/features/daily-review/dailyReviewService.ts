import { call } from "../../lib/tauriClient";
import type { DailyReview } from "./dailyReviewTypes";

/**
 * dailyReviewApi — data-access seam for the Daily Review feature.
 * All IPC goes through `call`, which owns logging and rethrow policy.
 */
export const dailyReviewApi = {
  loadAll: (): Promise<DailyReview[]> => call<DailyReview[]>("daily_review_load_all"),

  save: (review: DailyReview): Promise<void> => call("daily_review_save", { review }),

  delete: (id: string): Promise<void> => call("daily_review_delete", { id }),
};
