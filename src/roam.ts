import { PullBlock } from "roamjs-components/types";

type ReversePullBlock = {
  ":block/uid": string;
  ":block/string": string;
  ":node/title": string;
  ":block/_children": ReversePullBlock[];
};

export const getParentsStrFromBlockUid = (uid: string) => {
  const result = window.roamAlphaAPI.pull(
    `
        [
            :block/uid
            :block/string
            :node/title
            {:block/_children ...}
        ]
    `,
    [":block/uid", `${uid}`]
  ) as unknown as ReversePullBlock;

  if (result) {
    let strs: string[] = [];
    let ary = result[":block/_children"];
    while (ary && ary.length) {
      const block = ary[0];
      strs.unshift(block[":block/string"] || block[":node/title"]);
      ary = block[":block/_children"];
    }
    return strs;
  }
  return [];
};

const cache = new Map<string, PullBlock[]>();

const cleanCache = () => {
  cache.clear();
};

let ALLBLOCKS: Map<string, PullBlock> = new Map();
let PAGES: PullBlock[] = [];
type BlockWithPage = PullBlock & { page: string };
let BLOCKS: BlockWithPage[] = [];
export const getAllPages = () => {
  return PAGES;
};
export const getAllBlocks = () => {
    return BLOCKS;
}

export const renewCache = () => {
  ALLBLOCKS.clear();

  BLOCKS = (
    window.roamAlphaAPI.data.fast.q(
      `
    [
            :find (pull ?e [*]) ?e2
            :where                
                [?e :block/page ?p]
                [?p :block/uid ?e2]
        ]
    `
    ) as unknown as []
  ).map((item) => ({
    ...(item[0] as PullBlock),
    page: item[1],
  }));
  PAGES = window.roamAlphaAPI.data.fast.q(
    `
    [
            :find [(pull ?e [*]) ...]
            :where                
                [?e :node/title]
        ]
    `
  ) as unknown as PullBlock[];
  [...BLOCKS, ...PAGES].forEach((block) => {
    ALLBLOCKS.set(block[":block/uid"], block);
  });
  console.log(BLOCKS.length, PAGES.length);
  //   (
  //     window.roamAlphaAPI.data.fast.q(
  //       `
  //     [
  //             :find [(pull ?e [*]) ...]
  //             :where
  //                 [?e :block/uid ?u]
  //         ]
  //     `
  //     ) as PullBlock[]
  //   ).forEach((block) => {
  //     ALLBLOCKS.set(block[":block/uid"], block);
  //     if (block[":block/page"]) {
  //       BLOCKS.push({
  //         ...block,
  //         page: "",
  //       });
  //     } else {
  //       PAGES.push(block);
  //     }
  //   });
  console.log(ALLBLOCKS);
};

export const getCache = () => {
  return ALLBLOCKS;
};

// TODO: if api available 如果 graph 没有变化, 则 cache 不清空
const saveToCache = (k: string, blocks: PullBlock[]) => {
  cache.set(k, blocks);
  cleanCache();
};
const getFromCache = (k: string) => {
  return cache.get(k);
};

export const getBlocksContainsStr = (s: string) => {
  const cacheValue = getFromCache(s);
  if (cacheValue) {
    return cacheValue;
  }
  const result = window.roamAlphaAPI.data.fast.q(`
    [
            :find [(pull ?e [*]) ...]
            :where
                [?e :block/uid ?uid]
                [?b :block/string ?s]
                [(clojure.string/includes? ?s  "${s}")]
        ]
    `) as unknown as PullBlock[];
  saveToCache(s, result);
  return result;
};

export const getPageUidsFromUids = (uids: string[]) => {
  return window.roamAlphaAPI.q(
    `
        [
            :find [?e ...]
            :in $ [?uid ...]
            :where
                [?b :block/uid ?uid]
                [?b :block/page ?p]
                [?p :block/uid ?e]
        ]
        
    `,
    uids
  ) as unknown as string[];
};

export const opens = {
  main: {
    page(id: string) {
      window.roamAlphaAPI.ui.mainWindow.openPage({
        page: {
          uid: id,
        },
      });
    },
    block(id: string) {
      window.roamAlphaAPI.ui.mainWindow.openBlock({
        block: {
          uid: id,
        },
      });
    },
  },
  sidebar(id: string) {
    window.roamAlphaAPI.ui.rightSidebar.addWindow({
      window: {
        "block-uid": id,
        type: "block",
      },
    });
  },
};
