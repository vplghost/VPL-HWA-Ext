import { nextTick } from 'vue';
import type { DailyActivityId } from '../services/dailyAutopilotService.ts';
import type { ModalName } from './useModals.ts';

export interface AutopilotDialogRunResult {
  status: 'done' | 'waiting' | 'skipped' | 'error';
  detail: string;
  waitingUntil?: number;
  error?: string;
}

export interface AutopilotDialogRunner {
  stepId: DailyActivityId;
  modalName: ModalName;
  run: (ctx: { isAborted: () => boolean }) => Promise<AutopilotDialogRunResult>;
  stop?: () => Promise<void> | void;
}

const dialogRunnerRegistry = new Map<DailyActivityId, AutopilotDialogRunner>();

/**
 * Registers a dialog's native 1:1 action handler so Daily Autopilot executes the exact same
 * logic as clicking the manual button inside that dialog.
 * Returns an unregister callback suitable for `onUnmounted()`.
 */
export function registerAutopilotDialogRunner(runner: AutopilotDialogRunner): () => void {
  dialogRunnerRegistry.set(runner.stepId, runner);
  return () => {
    if (dialogRunnerRegistry.get(runner.stepId) === runner) {
      dialogRunnerRegistry.delete(runner.stepId);
    }
  };
}

export function unregisterAutopilotDialogRunner(stepId: DailyActivityId): void {
  dialogRunnerRegistry.delete(stepId);
}

export function hasAutopilotDialogRunner(stepId: DailyActivityId): boolean {
  return dialogRunnerRegistry.has(stepId);
}

export function getAutopilotDialogRunner(stepId: DailyActivityId): AutopilotDialogRunner | undefined {
  return dialogRunnerRegistry.get(stepId);
}

/**
 * Runs a registered dialog-backed Autopilot step with strict modal ownership semantics:
 * 1. Opens the dialog ONLY if it was not already open.
 * 2. Awaits the dialog's native 1:1 run handler.
 * 3. Closes the dialog in `finally` ONLY if Autopilot was the one that opened it.
 */
export async function runAutopilotStepViaDialog(
  stepId: DailyActivityId,
  opts: {
    openModal: (name: ModalName) => void;
    closeModal: (name: ModalName) => void;
    isModalOpen: (name: ModalName) => boolean;
    isAborted: () => boolean;
    waitTick?: () => Promise<void>;
  }
): Promise<AutopilotDialogRunResult | null> {
  const runner = dialogRunnerRegistry.get(stepId);
  if (!runner) return null;

  const wasAlreadyOpen = opts.isModalOpen(runner.modalName);
  if (!wasAlreadyOpen) {
    opts.openModal(runner.modalName);
    if (opts.waitTick) {
      await opts.waitTick();
    } else {
      await nextTick();
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  try {
    return await runner.run({ isAborted: opts.isAborted });
  } finally {
    if (!wasAlreadyOpen) {
      opts.closeModal(runner.modalName);
    }
  }
}

export async function stopActiveAutopilotDialogRunner(stepId: DailyActivityId | null | undefined): Promise<void> {
  if (!stepId) return;
  const runner = dialogRunnerRegistry.get(stepId);
  if (runner?.stop) {
    await runner.stop();
  }
}
