import { PullBlock } from "roamjs-components/types";
import { pull } from "./helper";
import { CacheBlockType, getAllBlocks, getAllPages } from "./roam";

let conditionRule = "";

export const Query = (config: {
  search: string[];
  modificationDate?: SelectDate;
  creationDate?: SelectDate;
  uids?: string[];
  caseIntensive: boolean;
}) => {
  console.time("SSSS");
  const filterStringByKeywordsIntensive = (
    blocks: PullBlock[],
    keyword: string,
    intensive = true
  ) => {};
  conditionRule = `
      [
        [
          (condition ?block)
            ${
              config.modificationDate
                ? `
                [?block :edit/time ?etime]
                [(>= ?etime ${config.modificationDate.start.valueOf()})]
                [(<= ?etime ${config.modificationDate.end.valueOf()})]
            `
                : ""
            }
            ${
              config.creationDate
                ? `
                [?block :create/time ?ctime]
                [(>= ?ctime ${config.creationDate.start.unix()})]
                [(<= ?ctime ${config.creationDate.end.unix()})]
            `
                : ""
            }
            [?block]
          ]
      ]
    
    `;
  const cancelRef = {
    current: false,
  };
  const check = () => {
    if (cancelRef.current) {
      console.warn("cancel by input")
      throw new Error("Cancel");
    }
  };

function timeSlice_<T, D>(fnc: any, time = 16, cb = setTimeout) {
  return function (...args: T[]) {
    const fnc_ = fnc(...args);
    if (fnc.constructor.name !== "GeneratorFunction") return fnc_;

    let data: any;

    return new Promise<D>(async function go(resolve, reject) {
      try {
        const start = performance.now();

        do {
          check();
          data = fnc_.next(await data?.value);
        } while (!data.done && performance.now() - start < time);

        if (data.done) return resolve(data.value);

        cb(() => go(resolve, reject));
      } catch (e) {
        reject(e);
      }
    });
  };
}

  const includes = (p: string, n: string) => {
    if (!p) {
      return false;
    }
    if (config.caseIntensive) {
      return p.includes(n);
    } else {
      return p.toLowerCase().includes(n.toLowerCase());
    }
  };

  function* findBlocksContainsAllKeywords2(keywords: string[]) {
    const lowBlocks: CacheBlockType[] = [];
    const topBlocks: CacheBlockType[] = [];
    for (let item of getAllBlocks()) {
       if (config.uids?.length) {
         if (
           !config.uids.some((pageUid) => {
             return pageUid === item.page;
           })
         ) {
           return false;
         }
       }
       const r = keywords.every((keyword) => {
         return (
           item.block[":block/string"] &&
           includes(item.block[":block/string"], keyword)
         );
       });
       if (!r) {
         lowBlocks.push(item);
       } else {
         topBlocks.push(item);
       }
      yield r
    }
    // const result = getAllBlocks().filter((item) => {
    //   if (config.uids?.length) {
    //     if (
    //       !config.uids.some((pageUid) => {
    //         return pageUid === item.page;
    //       })
    //     ) {
    //       return false;
    //     }
    //   }
    //   const r = keywords.every((keyword) => {
    //     return (
    //       item.block[":block/string"] &&
    //       includes(item.block[":block/string"], keyword)
    //     );
    //   });
    //   if (!r) {
    //     lowBlocks.push(item);
    //   }
    //   return r;
    // });
    return [topBlocks, lowBlocks];
  }
  const findBlocksContainsAllKeywords = (keywords: string[]) => {
    const lowBlocks: CacheBlockType[] = [];
    const result = getAllBlocks().filter((item) => {
      if (config.uids?.length) {
        if (
          !config.uids.some((pageUid) => {
            return pageUid === item.page;
          })
        ) {
          return false;
        }
      }
      const r = keywords.every((keyword) => {
        return (
          item.block[":block/string"] &&
          includes(item.block[":block/string"], keyword)
        );
      });
      if (!r) {
        lowBlocks.push(item)
      }
      return r;
    });
    return [result, lowBlocks]
  };
  const timemeasure = (name: string, cb: () => void) => {
    console.time(name);
    cb();
    console.timeEnd(name);
  };
  async function findAllRelatedBlocks(keywords: string[]) {
    console.time("----")
    const timeSliceFind = timeSlice_(findBlocksContainsAllKeywords2);
    let [topLevelBlocks, lowBlocks] = await timeSliceFind(keywords);
    if (keywords.length <= 1) {
      return [topLevelBlocks, undefined] as const;
    }
    console.timeEnd("----");

    // const allRelatedGenerator = timeSlice_(findAllRelatedBlockGroupByPages);
    // console.log("find low");

    // let lowBlocks: CacheBlockType[] = [];
    timemeasure("0", () => {
      // lowBlocks = getAllBlocks().filter((b) => {
      //   return !topLevelBlocks.find(
      //     (tb) => tb.block[":block/uid"] === b.block[":block/uid"]
      //   );
      // });

      if (config.uids?.length) {
        lowBlocks = lowBlocks.filter((block) => {
          return config.uids.some((uid) => uid === block.page);
        });
      }
    });

    // keywords.forEach((keyword) => {
    //   lowBlocks.filter((item) => {
    //     return includes(item[":block/uid"], keyword);
    //   });
    // });

    const validateMap = new Map<string, boolean[]>();
    timemeasure("1", () => {
      lowBlocks = lowBlocks.filter((item) => {
        return keywords.some((keyword, index) => {
          const r = includes(item.block[":block/string"], keyword);
          if (!validateMap.has(item.page)) {
            validateMap.set(item.page, []);
          }
          if (r) validateMap.get(item.page)[index] = r;
          // console.log(item, r, keyword, " --- -- - - - - ---");
          return r;
        });
      });
    });

    // 如果 lowBlocks 出现过的页面,
    timemeasure("2", () => {
      lowBlocks = lowBlocks.filter((block) => {
        // 如果 topLevel 和 lowBlocks 是在相同的页面, 那么即使 lowBlocks 中没有出现所有的 keywords, 它们也应该出现在结果中.
        if (topLevelBlocks.some((tb) => tb.page === block.page)) {
          return true;
        }
        return keywords.every((k, i) => {
          return validateMap.get(block.page)[i];
        });
      });
      // console.log(keywords, validateMap, lowBlocks, "@@@----");
    });
    const map = new Map<string, CacheBlockType[]>();

    timemeasure("3", () => {
      lowBlocks.forEach((b) => {
        if (map.has(b.page)) {
          map.get(b.page).push(b);
        } else {
          map.set(b.page, [b]);
        }
      });
    });

    const lowBlocksResult = [...map.entries()].map((item) => {
      return {
        page: item[0],
        children: item[1],
      };
    });

    return [
      topLevelBlocks,
      lowBlocksResult,
      // (await allRelatedGenerator(keywords, topLevelBlocks)) as {
      //   page: string;
      //   children: string[];
      // }[],
    ] as const;
  }

  function findAllRelatedPageUids(keywords: string[]) {
    return getAllPages().filter((page) => {
      if (config.uids?.length) {
        if (!config.uids.some((uid) => page.block[":block/uid"] === uid)) {
          return false;
        }
      }
      const r = keywords.every((keyword) => {
        return includes(page.block[":node/title"], keyword);
      });
      return r;
    });
  }
  const { search } = config;
  // const ary = search.map(k => getBlocksContainsStr(k)).sort((a, b) => a.length - b.length);
  const ary = search;
  // console.log(search.length, config, "rule =", conditionRule, " startting ");
  const promise = Promise.all([
    findAllRelatedPageUids(ary),
    findAllRelatedBlocks(ary),
  ]);

  return {
    promise: promise.then(
      ([pageUids, [topLevelBlocks, lowLevelBlocks = []]]) => {
        const result = [
          // pull_many(pageUids),
          pageUids,
          // pull_many(topLevelBlocks),
          topLevelBlocks,
          //   .map((item) => {
          //   return {
          //     ...item,
          //     parents: getParentsInfoOfBlockUid(item[":block/uid"]),
          //   };
          // }),
          lowLevelBlocks
            .map((item) => {
              return {
                page: pull(item.page),
                children: item.children,
                isBlock: false,
              };
            })
            .filter((item) => item.page),

          // lowLevelBlocks,
        ] as const;
        // console.log("end!!!!!!", result);
        console.timeEnd("SSSS");

        return result;
      }
    ),
    cancel: () => {
      console.log('cancel -----@@@')
      cancelRef.current = true;
    },
  };
};
