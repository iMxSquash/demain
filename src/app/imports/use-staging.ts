"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { failedStagedFile, type ColumnChoiceFields, type StagedFile } from "./import-form-data";
import { stageFileAction } from "./stage-actions";
import { stageSources, type ColumnChoicesBySource } from "./stage-sources";

export interface Staging {
  current: number;
  total: number;
  name: string;
}

/** Reads files through the server one after the other; nothing is recorded by a reading. */
export function useStaging() {
  const t = useTranslations("imports");
  const [staging, setStaging] = useState<Staging | null>(null);

  async function stageOne(
    file: File,
    accountText: string,
    columns: ColumnChoiceFields | undefined,
  ): Promise<StagedFile> {
    const formData = new FormData();
    formData.set("accountId", accountText);
    formData.set("file", file);
    for (const [name, value] of Object.entries(columns ?? {})) formData.set(name, value);
    try {
      return await stageFileAction(formData);
    } catch (error) {
      // A file that fails must not stop the next ones: it gets a card that says so.
      console.error("Import staging failed", error);
      return failedStagedFile(file.name, t("staged.readFailed"));
    }
  }

  async function stageFiles(
    files: File[],
    accountText: string,
    choices: ColumnChoicesBySource,
  ) {
    const staged = await stageSources(
      files,
      choices,
      (file, columns) => stageOne(file, accountText, columns),
      (current, file) =>
        setStaging({ current, total: files.length, name: file.name }),
    );
    setStaging(null);
    return staged;
  }

  return { staging, stageOne, stageFiles };
}
