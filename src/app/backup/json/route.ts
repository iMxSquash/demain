import { createJsonExport } from "../../../export/json-export";
import { withDatabaseAsync } from "../../../storage/with-database";
import { readText } from "../../auth/auth-form-data";
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
  const formData = await request.formData();
  // A blank password is the explicit choice of a plain file; the page warns about it.
  const isEncrypted = readText(formData, "password") !== "";
  const confirmed = isEncrypted ? readConfirmedPassword(formData, translate) : null;
  if (confirmed && "errorResponse" in confirmed) {
    return confirmed.errorResponse;
  }

  try {
    const now = new Date();
    const file = await withDatabaseAsync((db) =>
      createJsonExport(db, now, confirmed?.password),
    );
    const extension = confirmed ? "json.enc" : "json";
    return fileResponse(file, `demain-export-${todayStamp(now)}.${extension}`);
  } catch (error) {
    return errorResponse(describeBackupFailure(error, translate));
  }
}
