import { CacheBlockType, getCacheByUid } from "./roam";
import dayjs from "dayjs";
import { ResultItem } from "./store";

export const CONSTNATS = {
  el: "advanced-search-el",
  history: "as-history",
  leftSidebarMenu: 'roam-sidebar-content',
  sidebarEl: 'as-sidebar-el'
};
let uninstalls: Function[] = [];

export const extension_helper = {
  on_uninstall: (cb: Function) => {
    uninstalls.push(cb);
  },
  uninstall() {
    uninstalls.forEach((fn) => {
      fn();
    });
    uninstalls = [];
  },
};

export const debounce = <T, R>(cb: (...t: T[]) => R, ms = 500) => {
  let timeout: any;
  return (...t: T[]) => {
    return new Promise<R>((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        resolve(cb.apply(null, t));
        timeout = null;
      }, ms);
    });
  };
};

export function getSame<T>(arr1: T[], arr2: T[]) {
  return [...new Set(arr1)].filter((item) => arr2.includes(item));
}

export function getDiff<T>(arr1: T[], arr2: T[]) {
  return arr1.concat(arr2).filter((v, index, arr) => {
    return arr.indexOf(v) === arr.lastIndexOf(v);
  });
}

export const pull = (uidOrTitle: string) => {
  return getCacheByUid(uidOrTitle);
  // return (
  //   window.roamAlphaAPI.data.pull("[*]", [":block/uid", uidOrTitle]) ||
  //   window.roamAlphaAPI.data.pull("[*]", [":node/title", uidOrTitle])
  // );
};

export const pull_many = (uids: string[]) => {
  return uids
    .map((uid) => {
      const r = getCacheByUid(uid);
      return r;
    })
    .filter((item) => item);
  // return window.roamAlphaAPI.data.pull_many(
  //   "[*]",
  //   uids.map((uid) => {
  //     return [":block/uid", uid];
  //   })
  // );
};

function escapeRegExpChars(text: string) {
  return text.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

export function toResultItem(item: ResultItem | CacheBlockType): ResultItem {
  if('page' in item) {
    
    return {
      id: item.block[":block/uid"],
      text: item.block[":block/string"],
      editTime:
        item.block[":edit/time"] || item.block[":create/time"],
      createTime: item.block[":create/time"],
      createUser: item.block[":create/user"]?.[":db/id"],
      isPage: false,
      paths: [] as string[],
      isSelected: false,
      children: [],
    };
  }

  return item
}

export function highlightText(text: string, query: string) {
  if (text.indexOf("![](data:image") > -1) {
    return <>{text}</>
  }
  let lastIndex = 0;
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map(escapeRegExpChars);
  if (words.length === 0) {
    return <>{text}</>;
  }
  const regexp = new RegExp(words.join("|"), "gi");
  const tokens: React.ReactNode[] = [];
  while (true) {
    const match = regexp.exec(text);
    if (!match) {
      break;
    }
    const length = match[0].length;
    const before = text.slice(lastIndex, regexp.lastIndex - length);
    if (before.length > 0) {
      tokens.push(before);
    }
    lastIndex = regexp.lastIndex;
    tokens.push(
      <span className="result-highlight" key={lastIndex}>
        {match[0]}
      </span>
    );
  }

  const rest = text.slice(lastIndex);
  if (rest.length > 0) {
    tokens.push(rest);
  }
  return <>{tokens}</>;
}

export const date = {
  fromNow(time: number) {
    // TODO: 有一些页面没有 edit time 和 create time. 使用第一个 child 的时间
    if (!dayjs(time).isValid()) {
      return "";
    }
    return dayjs(time).fromNow();
  },
  format(time: number, str = "HH:mm MMM DD, YYYY") {
    if (!dayjs(time).isValid()) {
      return "";
    }
    return dayjs(time).format("HH:mm MMM DD, YYYY");
  },
};


export const clone = <T,>(obj: T) => {
  return JSON.parse(JSON.stringify(obj)) as T
}

export function simulateClick(a: Element) {
  'mouseover mousedown mouseup click'.split(' ').forEach(type => {
    a.dispatchEvent(new MouseEvent(type, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
  });
}

export function timer(name: string) {
  console.time(name)
  return () => {
    console.timeEnd(name)
  }
}



// export function cacheBlockToUiResult(block: CacheBlockType) {
//   return {
//     id: block.block[":block/uid"],
//     text: block.block[":block/string"],
//     editTime: block.block[":edit/time"] || block.block[":create/time"],
//     createTime: block.block[":create/time"],
//     isPage: false,
//     // paths: block.parents.map(
//     //   (item) => item[":block/string"] || item[":node/title"]
//     // ),
//     paths: [],
//     isSelected: false,
//     children: [],
//     createUser: block.block[":create/user"]?.[":db/id"],
//   };
// }