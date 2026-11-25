"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { failedStagedFile, mappingToFormFields, type StagedFile } from "./import-form-data";
import { stageFileAction } from "./stage-actions";
import { stageSources, type ChoicesBySource, type SourceChoices } from "./stage-sources";

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
    { columns, mapping }: SourceChoices,
  ): Promise<StagedFile> {
    const formData = new FormData();
    formData.set("accountId", accountText);
    formData.set("file", file);
    const fields = { ...columns, ...(mapping === undefined ? {} : mappingToFormFields(mapping)) };
    for (const [name, value] of Object.entries(fields)) formData.set(name, value);
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
    choices: ChoicesBySource,
  ) {
    const staged = await stageSources(
      files,
      choices,
      (file, chosen) => stageOne(file, accountText, chosen),
      (current, file) =>
        setStaging({ current, total: files.length, name: file.name }),
    );
    setStaging(null);
    return staged;
  }

  return { staging, stageOne, stageFiles };
}
