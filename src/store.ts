import { TextArea, Toast, Toaster } from "@blueprintjs/core";
import { DateRange } from "@blueprintjs/datetime";
import {
  batch,
  computed,
  observable,
  ObservableObject,
  observe,
} from "@legendapp/state";
import dayjs, { Dayjs } from "dayjs";
import { ReactNode } from "react";
import { PullBlock } from "roamjs-components/types";
import { recentlyViewed, searchHistory } from "./extentionApi";
import {
  clone,
  CONSTNATS,
  debounce,
  extension_helper,
  getDiff,
  pull_many,
} from "./helper";
import { Query } from "./query";
import {
  CacheBlockType,
  deleteFromCacheByUid,
  getAllPages,
  getAllUsers,
  getCurrentPage,
  getMe,
  getPageUidsFromUids,
  getParentsStrFromBlockUid,
  initCache,
  opens,
  renewCache,
  renewCache2,
} from "./roam";

const delay = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

export type ResultItem = {
  id: string;
  text: string | ReactNode;
  editTime?: number;
  createTime: number;
  isPage: boolean;
  paths: string[];
  isSelected: boolean;
  children: ResultItem[];
  createUser: string | number;
};

const query = observable({
  creationDate: undefined as SelectDate,
  modificationDate: undefined as SelectDate,
  search: "",
  people: [],
  inPages: [],
  result: {
    pages: [] as CacheBlockType[],
    topBlocks: [] as (CacheBlockType & { parents?: CacheBlockType[] })[],
    lowBlocks: [] as
      | {
          page: CacheBlockType;
          children: CacheBlockType[];
        }[]
      | undefined,
  },
});

export type QueryResultItem =
  | CacheBlockType
  | { page: CacheBlockType; children: CacheBlockType[]; isBlock: boolean };

const copySelectedTarget = observable([] as ResultItem[]);

const MIN = 450;

const defaultConditions = {
  onlyPage: false,
  includePage: true,
  includeBlock: true,
  includeCode: true,
  caseIntensive: true,
  pages: {
    selected: [] as {
      id: string;
      text: string;
    }[],
    items: [] as {
      id: string;
      text: string;
    }[],
    current: {} as { id: string; text: string },
  },
  sort: {
    selection: [
      {
        text: "Priority",
      },
      { text: "Modified - descending" },
      { text: "Modified - ascending" },
      { text: "Created  - descending" },
      { text: "Created  - ascending" },
    ],
    selected: 0,
  },
  users: {
    items: [] as User[],
    selected: [] as { id: string; text: string }[],
  },
};

const ui = observable({
  graph: {
    loading: false,
    loaded: false,
  },
  open: false,
  visible: false,
  filter: {
    open: false,
  },
  multiple: false,
  selectedTarget: [] as QueryResultItem[],
  showSelectedTarget: false,
  conditions: clone(defaultConditions),
  copySelectedTarget,
  previewSelected: false,
  history: {
    search: [] as BaseUiItem[],
    viewed: [] as RecentlyViewedItem[],
  },

  tags: [] as string[],
  result: [] as QueryResultItem[], // 选择结果, 目前没有用
  loading: false,
  list: [] as QueryResultItem[],
  height: MIN,
});

extension_helper.on_uninstall(
  ui.history.viewed.onChange((items) => {
    recentlyViewed.save(items);
  })
);

extension_helper.on_uninstall(
  ui.history.search.onChange((items) => {
    searchHistory.save(items);
  })
);

const selectedTargetStore = new Map<string, ObservableObject<ResultItem>>();

const keywordsBuildFrom = (search: string) => {
  let keywords = [];
  var reg = new RegExp(/(\".+?\")|(\S+)/gi);
  let result;
  do {
    result = reg.exec(search);
    if (result) {
      keywords.push(result[0].replace(/\"(.+?)\"/, "$1"));
    }
  } while (result);
  // console.log("keywords = ", keywords);
  return keywords;
};

export const transformItem = (item: QueryResultItem) => {
  if (isNOtLowBlock(item)) {
    const block = item;

    return {
      id: block.block[":block/uid"],
      text: getText(block),
      editTime: block.block[":edit/time"] || block.block[":create/time"],
      createTime: block.block[":create/time"],
      isPage: false,
      createUser: block.block[":create/user"]?.[":db/id"],
      // paths: block.parents.map(
      //   (item) => item[":block/string"] || item[":node/title"]
      // ),
      paths: [],
      isSelected: false,
      children: [],
    };
  } else {
    return {
      id: item.page.block[":block/uid"],
      // text: item.page.block[":node/title"],
      text: getText(item),
      editTime:
        item.page.block[":edit/time"] || item.page.block[":create/time"],
      createTime: item.page.block[":create/time"],
      createUser: item.page.block[":create/user"]?.[":db/id"],
      isPage: true,
      paths: [] as string[],
      isSelected: false,
      children: item.children.map((block) => {
        return {
          id: block.block[":block/uid"],
          text: block.block[":block/string"],
          editTime: block.block[":edit/time"] || block.block[":create/time"],
          createTime: block.block[":create/time"],
          isPage: false,
          // paths: block.parents.map(
          //   (item) => item[":block/string"] || item[":node/title"]
          // ),
          paths: [],
          isSelected: false,
          children: [],
          createUser: block.block[":create/user"]?.[":db/id"],
        };
      }),
    };
  }
};
let cancelPre = () => {};
const trigger = debounce(
  async (search: string, caseIntensive: boolean, uids?: string[]) => {
    if (!search) {
      return;
    }
    // console.log(search, " start search");
    const queryAPi = Query({
      search: keywordsBuildFrom(search),
      uids,
      caseIntensive,
    });
    cancelPre = queryAPi.cancel;
    console.log(cancelPre, " = cancelpre");
    await queryAPi.promise.then(([pages, topBlocks, lowBlocks]) => {
      // console.log(pages.map( item => item[':block/uid']), topBlocks, " - set result-- " + search, lowBlocks);
      // query.result.set({
      //   pages,
      //   topBlocks,
      //   lowBlocks,
      // });
      // const result: ResultItem[] = [
      //   ...pages.map((block) => {
      //     return {
      //       id: block.block[":block/uid"],
      //       text: block.block[":node/title"],
      //       editTime: block.block[":edit/time"] || block.block[":create/time"],
      //       createTime: block.block[":create/time"],
      //       isPage: true,
      //       paths: [],
      //       isSelected: false,
      //       children: [],
      //       createUser: block.block[":create/user"]?.[":db/id"],
      //     };
      //   }),
      //   ...topBlocks.map((block) => {
      //     return {
      //       id: block.block[":block/uid"],
      //       text: block.block[":block/string"],
      //       editTime: block.block[":edit/time"] || block.block[":create/time"],
      //       createTime: block.block[":create/time"],
      //       isPage: false,
      //       createUser: block.block[":create/user"]?.[":db/id"],
      //       // paths: block.parents.map(
      //       //   (item) => item[":block/string"] || item[":node/title"]
      //       // ),
      //       paths: [],
      //       isSelected: false,
      //       children: [],
      //     };
      //   }),
      //   ...(lowBlocks || []).map((item) => {
      //     return {
      //       id: item.page.block[":block/uid"],
      //       text: item.page.block[":node/title"],
      //       editTime:
      //         item.page.block[":edit/time"] || item.page.block[":create/time"],
      //       createTime: item.page.block[":create/time"],
      //       createUser: item.page.block[":create/user"]?.[":db/id"],
      //       isPage: true,
      //       paths: [],
      //       isSelected: false,
      //       children: item.children.map((block) => {
      //         return {
      //           id: block.block[":block/uid"],
      //           text: block.block[":block/string"],
      //           editTime:
      //             block.block[":edit/time"] || block.block[":create/time"],
      //           createTime: block.block[":create/time"],
      //           isPage: false,
      //           // paths: block.parents.map(
      //           //   (item) => item[":block/string"] || item[":node/title"]
      //           // ),
      //           paths: [],
      //           isSelected: false,
      //           children: [],
      //           createUser: block.block[":create/user"]?.[":db/id"],
      //         };
      //       }),
      //     };
      //   }),
      // ];
      // const result =
      console.log(" ui result = ");
      batch(() => {
        ui.result.set([...pages, ...topBlocks, ...(lowBlocks || [])]);
      });
    });
    ui.loading.set(false);
  },
  500
);
let prevSearch = "";
ui.result.onChange((v) => {
  console.log("result changed:", v);
});

const triggerWhenSearchChange = async (next: string) => {
  if (!next) {
    return;
  }
  const nextStr = next.trim();
  const selectedPagesUids = ui.conditions.pages.selected.peek();
  const caseIntensive = ui.conditions.caseIntensive.peek();
  if (nextStr !== prevSearch) {
    ui.loading.set(!!nextStr);
    cancelPre();
    try {
      await trigger(
        nextStr,
        caseIntensive,
        selectedPagesUids.map((item) => item.id)
      );
    } catch (e) {
      console.error(e);
      // ui.loading.set(false);
    }
  }
};

const disposeSearch = query.search.onChange(async (next) => {
  triggerWhenSearchChange(next);
});

const dispose = observe(async () => {
  const search = query.search.peek().trim();
  const selectedPagesUids = ui.conditions.pages.selected.get();
  const caseIntensive = ui.conditions.caseIntensive.get();

  ui.loading.set(!!search);

  try {
    await trigger(
      search,
      caseIntensive,
      selectedPagesUids.map((item) => item.id)
    );
  } catch (e) {
    console.error(e, " ---");
    // ui.loading.set(false);
  }
});

function conditionFilter<T extends PullBlock>(
  blocks: T[],
  config: {
    modificationDate?: SelectDate;
    creationDate?: SelectDate;
  }
) {
  let result = blocks;
  if (config.modificationDate) {
    result = result.filter((item) => {
      return (
        item[":edit/time"] >= config.modificationDate.start.valueOf() &&
        item[":edit/time"] >= config.modificationDate.end.valueOf()
      );
    });
  }
  if (config.modificationDate) {
    result = result.filter((item) => {
      return (
        item[":create/time"] >= config.modificationDate.start.valueOf() &&
        item[":create/time"] >= config.modificationDate.end.valueOf()
      );
    });
  }
  return result;
}

// const isPage = ();
const isNOtLowBlock = (item: QueryResultItem): item is CacheBlockType => {
  return typeof item.page === "string";
};

const isPage = (item: QueryResultItem) => {
  return !item.isBlock;
};

const createUser = (item: QueryResultItem) => {
  return isNOtLowBlock(item)
    ? item.block[":create/user"][":db/id"]
    : item.page.block[":create/user"][":db/id"];
};

const editTime = (item: QueryResultItem) => {
  return isNOtLowBlock(item)
    ? item.block[":edit/time"]
    : item.page.block[":edit/time"];
};

const createTime = (item: QueryResultItem) => {
  return isNOtLowBlock(item)
    ? item.block[":create/time"]
    : item.page.block[":create/time"];
};
const getText = (item: QueryResultItem) => {
  return isNOtLowBlock(item)
    ? item.isBlock
      ? item.block[":block/string"]
      : item.block[":node/title"]
    : item.page.block[":node/title"];
};

export const getId = (item: QueryResultItem) => {
  return isNOtLowBlock(item)
    ? item.block[":block/uid"]
    : item.page.block[":block/uid"];
};

export const getChildren = (item: QueryResultItem) => {
  return isNOtLowBlock(item) ? [] : item.children;
};

const disposeUiResult = observe(async () => {
  let uiResult = ui.result.get();
  const includePage = ui.conditions.includePage.get();
  const includeBlock = ui.conditions.includeBlock.get();
  const users = ui.conditions.users.selected.get();
  if (!includeBlock || !includeBlock || users.length > 0) {
    uiResult = uiResult.filter((item) => {
      let result = true;
      if (!includePage) {
        result = !isPage(item);
      }
      if (result && !includeBlock) {
        result = isPage(item);
      }

      if (result && users.length) {
        result = users.some(
          (user) => String(user.id) === String(createUser(item))
        );
      }
      return result;
    });
  }

  // if (ui.conditions.onlyPage.get()) {
  //   uiResult = uiResult.filter((item) => item.isPage);
  // }
  // uiResult.filter( item => item.isPage)
  // const resultPages = getPageUidsFromUids(uiResult.map((item) => item.id));
  // 只有选中的 page 才出现.
  // uiResult = uiResult.filter((item) => {
  //   return selectedPagesUids.some((id) => id === item.id);
  // });
  const modificationDate = query.modificationDate.get();
  const creationDate = query.creationDate.get();

  if (modificationDate) {
    uiResult = uiResult.filter((item) => {
      return (
        editTime(item) >= modificationDate.start.valueOf() &&
        editTime(item) <= modificationDate.end.valueOf()
      );
    });
  }
  if (creationDate) {
    uiResult = uiResult.filter((item) => {
      return (
        createTime(item) >= creationDate.start.valueOf() &&
        createTime(item) <= creationDate.end.valueOf()
      );
    });
  }

  // console.log(ui.conditions.includeCode.get(), " - get render");
  if (!ui.conditions.includeCode.get()) {
    uiResult = uiResult
      .filter((item) => {
        const text = getText(item) as string;
        return (
          isPage(item) || !(text.startsWith("```") && text.endsWith("```"))
        );
      })
      .map((item) => {
        if (getChildren(item).length) {
          return {
            ...item,
            children: getChildren(item).filter((oi) => {
              const childText = getText(oi) as string;
              return !(
                childText.startsWith("```") && childText.endsWith("```")
              );
            }),
          };
        }
        return item;
      });
  }

  const sortFns = [
    () => 0,
    (a: QueryResultItem, b: QueryResultItem) => {
      return editTime(b) - editTime(a);
    },
    (a: QueryResultItem, b: QueryResultItem) => {
      return editTime(a) - editTime(b);
    },
    (a: QueryResultItem, b: QueryResultItem) => {
      return createTime(b) - createTime(a);
      //b.createTime - a.createTime;
    },
    (a: QueryResultItem, b: QueryResultItem) => {
      // return a.createTime - b.createTime;
      return createTime(a) - createTime(b);
    },
  ];
  const sortIndex = ui.conditions.sort.selected.get();
  if (sortIndex > 0) {
    uiResult = uiResult.slice().sort(sortFns[sortIndex]);
  }

  batch(() => {
    console.time("uiresult");
    // console.log("sorted-", uiResult);
    ui.list.set(uiResult);
    console.timeEnd("uiresult");
  });
});

const disposeUiResultSort = observe(() => {
  // TODO:
});

const disposeUiSelectablePages = observe(() => {
  // const list = ui.result.get();
  // const pages = list
  //   .filter((item) => isPage(item))
  //   .map((item) => ({
  //     id: getId(item),
  //     text: getText(item) as string,
  //   }));
  // const pageBlocks = pull_many(
  //   getPageUidsFromUids(
  //     list.filter((item) => !isPage(item)).map((item) => getId(item))
  //   )
  // );
  // // console.log(
  // //   [...pages,
  // //   ...pageBlocks.map((item) => ({
  // //     id: item[":block/uid"],
  // //     text: item[":node/title"],
  // //   }))].filter(item => item.text),
  // //   " ----"
  // // );
  // ui.conditions.pages.items.set(
  //   [
  //     ...pages,
  //     ...pageBlocks.map((item) => ({
  //       id: item.block[":block/uid"],
  //       text: item.block[":node/title"],
  //     })),
  //   ].filter((item) => item.text)
  // );
});

extension_helper.on_uninstall(() => {
  dispose();
  disposeSearch();
  disposeUiResult();
  disposeUiResultSort();
  disposeUiSelectablePages();
});

const saveToSearchViewed = (items: ResultItem[]) => {
  const viewed = ui.history.viewed.peek();
  ui.history.viewed.push(
    ...items
      .filter(
        (item) => viewed.findIndex((vItem) => item.id === vItem.id) === -1
      )
      .map((item) => ({
        id: item.id,
        text: item.text as string,
        isPage: item.isPage,
      }))
  );
};

export const store = {
  db: observable({
    ui,
    query,
  }),
  actions: {
    changeShowSelectedTarget() {
      ui.showSelectedTarget.toggle();
      if (ui.showSelectedTarget.peek()) {
        // ui.copySelectedTarget.set(
        // observable(ui.result.get().filter((o) => o.isSelected))
        // );
      } else {
        // ui.copySelectedTarget.get().forEach((o) => {
        //   console.log(
        //     ui.copySelectedTarget.get(),
        //     " - get",
        //     selectedTargetStore.get(o.uid)?.isSelected.get(),
        //     o.isSelected
        //   );
        //   selectedTargetStore.get(o.uid)?.isSelected.set(o.isSelected);
        // });

        ui.result.forEach((item) => {
          var a = selectedTargetStore.get(getId(item.peek()));
          // console.log(item, " = item");
        });

        ui.result.set(ui.result.get());
      }
    },
    changeSelectedTarget(item: ObservableObject<QueryResultItem>) {
      // const index = ui.selectedTarget
      //   .get()
      //   .findIndex((o) => o.uid === item.uid.peek());
      // console.log();
      // if (index > -1) {
      //   ui.selectedTarget.splice(index, 1);
      // } else {
      //   ui.selectedTarget.push(item.get());
      // }
      // item.isSelected.set(!item.isSelected.get());
      // selectedTargetStore.set(item.peek().id, item);
    },
    toggleDialog() {
      if (ui.visible.get()) {
        store.actions.closeDialog();
      } else {
        store.actions.openDialog();
        if (!ui.graph.loaded.get()) {
          store.actions.loadingGraph();
        } else {
          store.actions.renewGraph();
        }
      }
    },
    toggleFilter() {
      ui.filter.open.set((prev) => !prev);
    },
    openDialog() {
      ui.open.set(true);
      ui.visible.set(true);
    },
    closeDialog() {
      // ui.open.set(false);
      // console.log("close!!!");
      ui.visible.set(false);
    },
    changeCreateRange(range: DateRange) {
      if (!range[0] || !range[1]) {
        return;
      }
    },
    changeModifyRange(range: DateRange) {
      if (!range[0] || !range[1]) {
        return;
      }

      query.modificationDate.set({
        start: dayjs(range[0]).startOf("day"),
        end: dayjs(range[1]).startOf("day").add(1, "day").subtract(1, "second"),
      });
    },
    changeSearch(s: string) {
      // console.log(s, " ---s");
      query.search.set(s);
    },
    searchAgain() {
      triggerWhenSearchChange(query.search.peek());
    },
    clearSearch() {
      store.actions.changeSearch("");
    },
    useHistory(str: string) {
      store.actions.changeSearch(str);
    },

    history: {
      saveSearch(str: string) {
        ui.history.search.set([
          ...ui.history.search.peek().filter((item) => item.text !== str),
          {
            id: Date.now() + "",
            text: str,
          },
        ]);
      },
      deleteSearch(id: string) {
        const i = ui.history.search.findIndex((item) => item.id === id);
        // console.log("delete:", i, id);
        if (i > -1) {
          ui.history.search.splice(i, 1);
        }
      },
      deleteViewedItem(id: string) {
        const index = ui.history.viewed
          .peek()
          .findIndex((item) => item.id === id);
        if (index > -1) ui.history.viewed.splice(index, 1);
      },
      clearViewed() {
        ui.history.viewed.set([]);
      },
      clearSearch() {
        ui.history.search.set([]);
      },
    },
    toggleMultiple() {
      ui.multiple.toggle();

      ui.showSelectedTarget.set(false);
    },
    changeSort(index: number) {
      // console.log(index, " -");
      ui.conditions.sort.selected.set(index);
    },
    confirm: {
      openInSidebar(item: ResultItem) {
        const opened = opens.sidebar(item.id);
        if (!opened) {
          deleteListItemByUid(item.id);
        } else {
          saveToSearchViewed([item]);
        }
        return opened;
      },
      openInMain(item: ResultItem) {
        let opened = opens.main.page(item.id);
        if (opened) {
          saveToSearchViewed([item]);
        } else {
          deleteListItemByUid(item.id);
        }
        return opened;
      },
      saveAsReference(items: ResultItem[]) {
        const focusedBlock = window.roamAlphaAPI.ui.getFocusedBlock();
        const pasteStr = items
          .map((item) => {
            if (item.isPage) {
              return `[[${item.text}]]`;
            } else {
              return `((${item.id}))`;
            }
          })
          .join("\n");
        if (focusedBlock) {
          // focus lose....
          // const inputEl = document.querySelector(
          //   "textarea.rm-block-input"
          // ) as HTMLTextAreaElement;
          // inputEl.value = inputEl.value + pasteStr;
        } else {
        }
        navigator.clipboard.writeText(pasteStr);
        Toaster.create().show({
          message: "references copied",
        });
      },
      copyResult(oneline = false) {
        const pasteStr = ui.list
          .get()
          .map((item) => {
            if (isPage(item)) {
              return `[[${getText(item)}]]`;
            } else {
              return `((${getId(item)}))`;
            }
          })
          .join(oneline ? " " : "\n");
        navigator.clipboard.writeText(pasteStr);
      },
    },
    confirmMultiple() {
      const search = query.search.peek();
      store.actions.history.saveSearch(search);
    },
    clearLastEdit() {
      query.modificationDate.set(undefined);
    },
    quick: {
      lastWeek() {
        const today = new Date();

        const makeDate = (action: (d: Date) => void) => {
          const returnVal = new Date(today);
          action(returnVal);
          returnVal.setDate(returnVal.getDate() + 1);
          return returnVal;
        };

        const tomorrow = makeDate(() => null);
        const yesterday = makeDate((d) => d.setDate(d.getDate() - 2));
        const oneWeekAgo = makeDate((d) => d.setDate(d.getDate() - 7));
        store.actions.changeModifyRange([oneWeekAgo, today]);
      },
      today() {
        const today = new Date();
        store.actions.changeModifyRange([today, today]);
      },
      async currentPage() {
        const page = await getCurrentPage();
        store.actions.conditions.changeSelectedPages({
          id: page[":block/uid"],
          text: page[":node/title"],
        });
      },
      me() {
        const me = getMe();
        store.actions.conditions.changeSelectedUsers({
          id: me[":db/id"],
          text: me[":user/display-name"],
        });
      },
    },
    conditions: {
      toggleOnlyPage() {
        ui.conditions.onlyPage.toggle();
      },
      toggleIncludeCodeblock() {
        ui.conditions.includeCode.toggle();
      },
      toggleIncludePage() {
        ui.conditions.includePage.toggle();
      },
      toggleIncludeBlock() {
        ui.conditions.includeBlock.toggle();
      },
      toggleCaseIntensive() {
        ui.conditions.caseIntensive.toggle();
      },
      changeSelectedPages(obj: { id: string; text: string }) {
        const selected = ui.conditions.pages.selected.peek();
        const index = selected.findIndex((item) => item.id === obj.id);
        if (index > -1) {
          ui.conditions.pages.selected.splice(index, 1);
        } else {
          ui.conditions.pages.selected.push(obj);
        }
      },
      changeSelectedUsers(user: { id: string; text: string }) {
        const selected = ui.conditions.users.selected.peek();
        const index = selected.findIndex((item) => item.id === user.id);
        if (index > -1) {
          ui.conditions.users.selected.splice(index, 1);
        } else {
          ui.conditions.users.selected.push(user);
        }
      },
      reset() {
        ui.conditions.set(clone(defaultConditions));
        query.modificationDate.set(undefined);
        query.creationDate.set(undefined);
      },
    },
    changeTags(tags: string[]) {
      ui.tags.set(tags);
    },

    setHeight(vHeight: number) {
      const windowHeight = document.body.getBoundingClientRect().height;
      const MAX = windowHeight - 250;
      const height = Math.max(MIN, Math.min(vHeight, MAX));
      ui.height.set(height);
    },
    onVisibleChange(cb: (b: boolean) => void) {
      return ui.visible.onChange(cb);
    },
    async loadingGraph() {
      ui.graph.loading.set(true);
      await delay(10);
      initCache();
      ui.graph.loading.set(false);
      ui.graph.loaded.set(true);
    },
    async renewGraph() {
      await delay();
      renewCache2();
    },
  },
  ui: {
    isLoadingGraph() {
      return ui.graph.loading.get();
    },
    isFilterOpen() {
      return ui.filter.open.get();
    },
    isOpen() {
      const visible = ui.visible.get();
      const open = ui.open.get();
      return window.roamAlphaAPI.platform.isMobile ? visible : open;
    },
    getSearch() {
      return query.search.get();
    },
    getDateRange() {
      return [] as string[];
    },
    isTyped() {
      return query.search.get()?.length;
    },
    hasValidSearch() {
      return query.search.get()?.trim()?.length;
    },
    isMultipleSelection() {
      return ui.multiple.get();
    },
    isShowSelectedTarget() {
      return ui.showSelectedTarget.get();
    },
    getHistory() {
      return ui.history;
    },
    history: {
      getViewed() {
        return ui.history.viewed;
      },
      getSearch() {
        return ui.history.search;
      },
    },
    selectedCount() {
      // return ui.result.get().filter((o) => o.isSelected).length;
      return 0;
    },
    sort: {
      selection() {
        return ui.conditions.sort.selection.get();
      },
      selectedText() {
        let r =
          ui.conditions.sort.selection[
            ui.conditions.sort.selected.get()
          ].text.get();
        return r;
      },
    },
    date: {
      lastEditRange() {
        const date = query.modificationDate.get();
        if (!date) {
          return undefined;
        }
        return [
          new Date(date.start.toString()),
          new Date(date.end.toString()),
        ] as DateRange;
      },
      lastEdit() {
        const date = query.modificationDate.get();
        if (!date) {
          return "";
        }
        const startTime = date.start;
        const endTime = date.end;
        return (
          dayjs(startTime).format("YYYY/MM/DD") +
          " - " +
          dayjs(endTime).format("YYYY/MM/DD")
        );
      },
    },
    conditions: {
      isOnlyPage() {
        return ui.conditions.onlyPage.get();
      },
      isIncludeCodeblock() {
        return ui.conditions.includeCode.get();
      },
      isCaseIntensive() {
        return ui.conditions.caseIntensive.get();
      },
      isIncludePage() {
        return ui.conditions.includePage.get();
      },
      isIncludeBlock() {
        return ui.conditions.includeBlock.get();
      },
      pages: {
        get() {
          return getAllPages()
            .map((item) => ({
              id: item.block[":block/uid"],
              text: item.block[":node/title"],
            }))
            .filter((item) => item.text);
        },
        isSelected(id: string) {
          return (
            ui.conditions.pages.selected
              .get()
              .findIndex((item) => item.id === id) > -1
          );
        },
        getSelected() {
          return ui.conditions.pages.selected.get();
        },
        hasCurrentPage() {
          const c = ui.conditions.pages.current.get();
          return ui.conditions.pages.selected.get().length === 0 && c.id;
        },
      },
      users: {
        get() {
          return getAllUsers().map((item) => ({
            id: item[":db/id"],
            text: item[":user/display-name"],
          }));
        },
        isSelected(id: string) {
          return (
            ui.conditions.users.selected
              .get()
              .findIndex((item) => item.id === id) > -1
          );
        },
        getSelected() {
          return ui.conditions.users.selected.get();
        },
      },
      hasChanged() {
        const nowConditions = ui.conditions.get();
        // console.log(nowConditions, " --- ", defaultConditions, query.people.get());
        return [
          query.modificationDate.get() !== undefined,
          query.creationDate.get() !== undefined,
          nowConditions.users.selected.length !== 0,
          nowConditions.caseIntensive !== defaultConditions.caseIntensive,
          nowConditions.includeBlock !== defaultConditions.includeBlock,
          nowConditions.includePage !== defaultConditions.includePage,
          nowConditions.includeCode !== defaultConditions.includeCode,
          nowConditions.pages.selected.length !==
            defaultConditions.pages.selected.length,
          nowConditions.sort.selected !== defaultConditions.sort.selected,
        ].some((v) => v);
      },
    },
    tags: {
      getTags() {
        return ui.tags.get();
      },
    },
    isSelectedTarget(item: QueryResultItem) {
      // const r =
      //   ui.selectedTarget.get().findIndex((o) => o.uid === item.peek().uid) >
      //   -1;
      // return item.isSelected;
      return false;
    },

    result: {
      size() {
        return ui.result.get().length;
      },
      list() {
        return ui.list.get();
      },
      listSize() {
        return ui.list.get().length;
      },
      getListStyle() {
        const height = ui.height.get();
        return {
          height,
          minHeight: height,
        };
      },
    },
    copySelectedTarget() {
      return ui.copySelectedTarget;
    },
    isLoading() {
      return ui.loading.get();
      // return true;
    },
    getPathsFromUid(uid: string) {
      return getParentsStrFromBlockUid(uid);
    },
    size: {
      resultList() {},
    },
    hasResult() {
      return store.ui.getSearch().length > 0 && store.ui.result.size() > 0;
    },
  },
};

ui.visible.onChange(async (next) => {
  const el = document.querySelector("." + CONSTNATS.el);
  if (el) {
    if (!next) {
      el.classList.add("invisible");
    } else {
      el.classList.remove("invisible");
    }
  }
  if (!next) {
  } else {
    setTimeout(() => {
      triggerWhenSearchChange(query.search.peek());
    }, 10);
    const page = await getCurrentPage();
    if (page) {
      ui.conditions.pages.current.set({
        id: page[":block/uid"],
        text: page[":node/title"],
      });
    }
  }
});
ui.open.onChange((next) => {
  if (next !== true) {
    // query.search.set("");
  } else {
  }
});

export const initStore = (extensionAPI: RoamExtensionAPI) => {
  ui.history.viewed.set(recentlyViewed.getAll());
  ui.history.search.set(searchHistory.getAll());
};

// @ts-ignore
window._store = store;
function deleteListItemByUid(id: string) {
  deleteFromCacheByUid(id);
  store.actions.searchAgain();
  // const foundIndex = ui.list.findIndex(item => item.id === id);
  // foundIndex > -1 && ui.list.splice(foundIndex, 1);
}
