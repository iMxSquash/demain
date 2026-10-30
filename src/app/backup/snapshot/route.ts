import { createSnapshot } from "../../../export/snapshot";
import { withDatabaseAsync } from "../../../storage/with-database";
import { hasCompleteSession } from "../../auth/session";
import { getTranslator } from "../../translator";
import { describeBackupFailure } from "../backup-feedback";
import {
  fileResponse,
  errorResponse,
  readConfirmedPassword,
  todayStamp,
  unauthorized,
} from "../download-response";

export async function POST(request: Request): Promise<Response> {
  const translate = await getTranslator();
  if (!(await hasCompleteSession())) {
    return unauthorized(translate);
  }
  const confirmed = readConfirmedPassword(await request.formData(), translate);
  if ("errorResponse" in confirmed) {
    return confirmed.errorResponse;
  }

  try {
    const snapshot = await withDatabaseAsync((db) => createSnapshot(db, confirmed.password));
    return fileResponse(snapshot, `demain-snapshot-${todayStamp(new Date())}.dmbk`);
  } catch (error) {
    return errorResponse(describeBackupFailure(error, translate));
  }
}
