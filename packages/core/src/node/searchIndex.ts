import path, { join } from 'path';
import fs from '@rspress/shared/fs-extra';
import chalk from '@rspress/shared/chalk';
import { RequestHandler } from '@modern-js/types';
import fetch from 'node-fetch';
import { UserConfig, isSCM, SEARCH_INDEX_NAME } from '@rspress/shared';
import { logger } from '@rspress/shared/logger';
import { isProduction, OUTPUT_DIR, TEMP_DIR } from './constants';

export async function writeSearchIndex(config: UserConfig) {
  if (config?.search === false) {
    return;
  }
  const cwd = process.cwd();
  // get all search index files, format is `${SEARCH_INDEX_NAME}.xxx.${hash}.json`
  const searchIndexFiles = await fs.readdir(TEMP_DIR);
  const outDir = config?.outDir ?? join(cwd, OUTPUT_DIR);

  // For performance, we only stitch the string of search index data instead of big JavaScript object in memory
  let searchIndexData = '[]';
  let scaning = false;
  for (const searchIndexFile of searchIndexFiles) {
    if (
      !searchIndexFile.includes(SEARCH_INDEX_NAME) ||
      !searchIndexFile.endsWith('.json')
    ) {
      continue;
    }
    const source = join(TEMP_DIR, searchIndexFile);
    const target = join(outDir, 'static', searchIndexFile);
    const searchIndex = await fs.readFile(
      join(TEMP_DIR, searchIndexFile),
      'utf-8',
    );
    searchIndexData = `${searchIndexData.slice(0, -1)}${
      scaning ? ',' : ''
    }${searchIndex.slice(1)}`;
    await fs.move(source, target, { overwrite: true });
    scaning = true;
  }

  if (isProduction() && isSCM() && config?.search?.mode === 'remote') {
    const { apiUrl, indexName } = config.search;
    try {
      await fetch(`${apiUrl}?index=${indexName}`, {
        method: 'PUT',
        body: searchIndexData,
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info(
        chalk.green(
          `[doc-tools] Search index uploaded to ${apiUrl}, indexName: ${indexName}`,
        ),
      );
    } catch (e) {
      logger.info(
        chalk.red(
          `[doc-tools] Upload search index \`${indexName}\` failed:\n ${e}`,
        ),
      );
    }
  }
}

export function serveSearchIndexMiddleware(config: UserConfig): RequestHandler {
  return (req, res, next) => {
    const searchIndexRequestMatch = `/${SEARCH_INDEX_NAME}.`;
    if (req.url?.includes(searchIndexRequestMatch)) {
      res.setHeader('Content-Type', 'application/json');
      // Get search index name from request url
      const searchIndexFile = req.url?.split('/').pop();
      const searchIndex = fs.readFileSync(
        path.join(
          process.cwd(),
          config?.outDir || OUTPUT_DIR,
          'static',
          searchIndexFile,
        ),
        'utf-8',
      );
      res.end(searchIndex);
    } else {
      next?.();
    }
  };
}
