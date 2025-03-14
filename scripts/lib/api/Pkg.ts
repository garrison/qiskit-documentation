// This code is a Qiskit project.
//
// (C) Copyright IBM 2024.
//
// This code is licensed under the Apache License, Version 2.0. You may
// obtain a copy of this license in the LICENSE file in the root directory
// of this source tree or at http://www.apache.org/licenses/LICENSE-2.0.
//
// Any modifications or derivative works of this code must retain this
// copyright notice, and modified files need to carry a notice indicating
// that they have been altered from the originals.

import { join } from "path/posix";

import { findLegacyReleaseNotes } from "./releaseNotes";
import { getRoot } from "../fs";
import { determineHistoricalQiskitGithubUrl } from "../qiskitMetapackage";

export interface ReleaseNoteEntry {
  title: string;
  url: string;
}

type PackageType = "latest" | "historical" | "dev";

/**
 * Information about the specific package and version we're dealing with, e.g. qiskit 0.45.
 */
export class Pkg {
  readonly name: string;
  readonly title: string;
  readonly githubSlug: string;
  readonly hasSeparateReleaseNotes: boolean;
  readonly version: string;
  readonly versionWithoutPatch: string;
  readonly type: PackageType;
  readonly releaseNoteEntries: ReleaseNoteEntry[];

  static VALID_NAMES = ["qiskit", "qiskit-ibm-runtime", "qiskit-ibm-provider"];

  constructor(kwargs: {
    name: string;
    title: string;
    githubSlug: string;
    hasSeparateReleaseNotes: boolean;
    version: string;
    versionWithoutPatch: string;
    type: PackageType;
    releaseNoteEntries: ReleaseNoteEntry[];
  }) {
    this.name = kwargs.name;
    this.title = kwargs.title;
    this.githubSlug = kwargs.githubSlug;
    this.hasSeparateReleaseNotes = kwargs.hasSeparateReleaseNotes;
    this.version = kwargs.version;
    this.versionWithoutPatch = kwargs.versionWithoutPatch;
    this.type = kwargs.type;
    this.releaseNoteEntries = kwargs.releaseNoteEntries;
  }

  static async fromArgs(
    name: string,
    version: string,
    versionWithoutPatch: string,
    type: PackageType,
  ): Promise<Pkg> {
    const args = {
      name,
      version,
      versionWithoutPatch,
      type,
    };

    if (name === "qiskit") {
      const releaseNoteEntries = await findLegacyReleaseNotes(name);
      return new Pkg({
        ...args,
        title: "Qiskit SDK",
        name: "qiskit",
        githubSlug: "qiskit/qiskit",
        hasSeparateReleaseNotes: true,
        releaseNoteEntries,
      });
    }

    if (name === "qiskit-ibm-runtime") {
      return new Pkg({
        ...args,
        title: "Qiskit Runtime IBM Client",
        name: "qiskit-ibm-runtime",
        githubSlug: "qiskit/qiskit-ibm-runtime",
        hasSeparateReleaseNotes: false,
        releaseNoteEntries: [],
      });
    }

    if (name === "qiskit-ibm-provider") {
      return new Pkg({
        ...args,
        title: "Qiskit IBM Provider (deprecated)",
        name: "qiskit-ibm-provider",
        githubSlug: "qiskit/qiskit-ibm-provider",
        hasSeparateReleaseNotes: false,
        releaseNoteEntries: [],
      });
    }

    throw new Error(`Unrecognized package: ${name}`);
  }

  static mock(kwargs: {
    name?: string;
    title?: string;
    githubSlug?: string;
    hasSeparateReleaseNotes?: boolean;
    version?: string;
    versionWithoutPatch?: string;
    type?: PackageType;
    releaseNoteEntries?: ReleaseNoteEntry[];
  }): Pkg {
    return new Pkg({
      name: kwargs.name ?? "my-quantum-project",
      title: kwargs.title ?? "My Quantum Project",
      githubSlug: kwargs.githubSlug ?? "qiskit/my-quantum-project",
      hasSeparateReleaseNotes: kwargs.hasSeparateReleaseNotes ?? false,
      version: kwargs.version ?? "0.1.0",
      versionWithoutPatch: kwargs.versionWithoutPatch ?? "0.1",
      type: kwargs.type ?? "latest",
      releaseNoteEntries: kwargs.releaseNoteEntries ?? [],
    });
  }

  outputDir(parentDir: string): string {
    let path = join(parentDir, "api", this.name);
    if (this.isHistorical()) {
      path = join(path, this.versionWithoutPatch);
    } else if (this.isDev()) {
      path = join(path, "dev");
    }
    return path;
  }

  sphinxArtifactFolder(): string {
    return `${getRoot()}/.sphinx-artifacts/${this.name}/${
      this.versionWithoutPatch
    }`;
  }

  isHistorical(): boolean {
    return this.type == "historical";
  }

  isDev(): boolean {
    return this.type == "dev";
  }

  isLatest(): boolean {
    return this.type == "latest";
  }

  hasObjectsInv(): boolean {
    return this.name !== "qiskit" || +this.versionWithoutPatch >= 0.45;
  }

  releaseNotesTitle(): string {
    const versionStr = this.hasSeparateReleaseNotes
      ? ` ${this.versionWithoutPatch}`
      : "";
    return `${this.title}${versionStr} release notes`;
  }

  /**
   * Returns a function that takes in a fileName like `qiskit_ibm_provider/job/exceptions` and returns the
   * stable GitHub URL to the file for this package's version.
   *
   * The input fileName will not have a file extension. It will use whatever file name was generated by
   * `sphinx.ext.viewcode`, which means we need to deal with its quirks like handling `__init__.py`.
   */
  determineGithubUrlFn(): (fileName: string) => string {
    // For files like `my_module/__init__.py`, `sphinx.ext.viewcode` will title the
    // file `my_module.py`. We need to add back the `/__init__.py` when linking to GitHub.
    const convertToInitPy = new Set([
      "qiskit_ibm_provider",
      "qiskit/qasm",
      "qiskit/qasm2",
      "qiskit/qasm3",
      "qiskit/qobj",
      "qiskit/providers/ibmq",
      "qiskit/transpiler/preset_passmanagers",
    ]);
    const normalizeFile = (fp: string) =>
      convertToInitPy.has(fp) ? `${fp}/__init__` : fp;

    // Provider, Runtime, and Qiskit 0.45+ are simple: there is a branch called `stable/<version>`
    // like `stable/0.45` in each GitHub project.
    if (
      this.name !== "qiskit" ||
      this.type === "dev" ||
      +this.versionWithoutPatch >= 0.45
    ) {
      const branchName =
        this.type === "dev" && this.version.endsWith("-dev")
          ? "main"
          : `stable/${this.versionWithoutPatch}`;
      const baseUrl = `https://github.com/${this.githubSlug}/tree/${branchName}`;
      return (fileName) => {
        return `${baseUrl}/${normalizeFile(fileName)}.py`;
      };
    }

    // Otherwise, we have to deal with Qiskit <0.45, when we had the qiskit-metapackage comprised of
    // multiple packages. Refer to the version table in api/qiskit/release-notes/0.44.mdx.
    return (fileName) =>
      determineHistoricalQiskitGithubUrl(
        this.versionWithoutPatch,
        normalizeFile(fileName),
      );
  }
}
