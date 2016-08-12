import { copy } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")
const readInstalled = require("read-installed")

// we use relative path to avoid canonical path issue - e.g. /tmp vs /private/tmp
export function copyFiltered(src: string, destination: string, filter: (file: string) => boolean, dereference: boolean): Promise<any> {
  return copy(src, destination, {
    dereference: dereference,
    filter: filter
  })
}

export function hasMagic(pattern: Minimatch) {
  const set = pattern.set
  if (set.length > 1) {
    return true
  }

  for (let i of set[0]) {
    if (typeof i !== "string") {
      return true
    }
  }

  return false
}

export function createFilter(src: string, patterns: Array<Minimatch>, ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | null): (file: string) => boolean {
  return function filter(it) {
    if (src === it) {
      return true
    }

    if (rawFilter != null && !rawFilter(it)) {
      return false
    }

    let relative = it.substring(src.length + 1)

    // yes, check before path sep normalization
    if (ignoreFiles != null && ignoreFiles.has(relative)) {
      return false
    }

    if (path.sep === "\\") {
      relative = relative.replace(/\\/g, "/")
    }

    return minimatchAll(relative, patterns) && (excludePatterns == null || !minimatchAll(relative, excludePatterns))
  }
}

export function devDependencies(dir: string): Promise<Array<string>> {
  return new BluebirdPromise((resolve, reject) => {
    readInstalled(dir, (error: Error, data: any) => {
      if (error) {
        reject(error)
      }
      else {
        resolve(flatDependencies(data, new Set()))
      }
    })
  })
}

function flatDependencies(data: any, seen: Set<string>): any {
  const deps = data.dependencies
  if (deps == null) {
    return []
  }

  return Object.keys(deps).map(function (d) {
    if (typeof deps[d] !== "object" || seen.has(deps[d])) {
      return null
    }

    seen.add(deps[d])
    if (deps[d].extraneous) {
      const extra = deps[d]
      delete deps[d]
      return extra.path
    }
    return flatDependencies(deps[d], seen)
  })
    .filter(it => it !== null)
    .reduce(function FLAT(l, r) {
      return l.concat(Array.isArray(r) ? r.reduce(FLAT, []) : r)
    }, [])

}

// https://github.com/joshwnj/minimatch-all/blob/master/index.js
function minimatchAll(path: string, patterns: Array<Minimatch>): boolean {
  let match = false
  for (let pattern of patterns) {
    // If we've got a match, only re-test for exclusions.
    // if we don't have a match, only re-test for inclusions.
    if (match !== pattern.negate) {
      continue
    }

    // partial match — pattern: foo/bar.txt path: foo — we must allow foo
    // use it only for non-negate patterns: const m = new Minimatch("!node_modules/@(electron-download|electron)/**/*", {dot: true }); m.match("node_modules", true) will return false, but must be true
    match = pattern.match(path, !pattern.negate)
  }
  return match
}