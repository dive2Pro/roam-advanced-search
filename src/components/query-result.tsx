import {
  Icon,
  Checkbox,
  Classes,
  Card,
  Button,
  ButtonGroup,
  Divider,
  Menu,
  MenuItem,
  Popover,
  Position,
  Toaster,
} from "@blueprintjs/core";
import { For, observer } from "@legendapp/state/react";
import {
  store,
  ResultItem,
  transformItem,
  QueryResultItem,
  getId,
  getChildren,
} from "../store";
import { ObservableObject, observe } from "@legendapp/state";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { date, highlightText } from "../helper";
import { Virtuoso } from "react-virtuoso";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { UnderMobile } from "./commons/under-mobile";
import { MobileSidebar } from "./sidebar";
import { isAutoCloseWhenShiftClick } from "../config";
import { usePortal } from "./commons/use-portal";
dayjs.extend(relativeTime);

const Row = observer((props: { item: QueryResultItem }) => {
  const item = transformItem(props.item);
  const [text, setText] = useState(<>{item.text}</>);
  const [children, setChildren] = useState(item.children);
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    let timeout: any;
    const textDispose = observe(() => {
      const search = store.ui.getSearch();
      const isLoading = store.ui.isLoading();
      clearTimeout(timeout);
      if (!search || isLoading) {
        return;
      }
      window.requestIdleCallback(() => {
        timeout = setTimeout(() => {
          setText(highlightText(item.text as string, search));
          setChildren(
            children.map((child) => {
              return {
                ...child,
                text: highlightText(child.text as string, search) as unknown as string,
              };
            })
          );
        }, 50);
      });
    });

    const pathDispose = observe(() => {
      const search = store.ui.getSearch();
      const isLoading = store.ui.isLoading();
      if (isLoading || !search) {
        return;
      }

      setPath(store.ui.getPathsFromUid(item.id));
    });

    return () => {
      textDispose();
      pathDispose();
    };
  }, [item.id]);

  const handlerClick = (e: React.MouseEvent, item: ResultItem) => {
    e.preventDefault();
    e.stopPropagation();
    let opened = false;
    if (e.shiftKey) {
      opened = store.actions.confirm.openInSidebar(item);
      if (opened) {
        if (isAutoCloseWhenShiftClick()) {
          store.actions.closeDialog();
        }
      }
    } else {
      opened = store.actions.confirm.openInMain(item);
      if (opened) store.actions.closeDialog();
    }
    opened && store.actions.history.saveSearch(store.ui.getSearch());
    !opened &&
      Toaster.create({}).show({
        message: `${item.isPage ? "Page" : "Block"} was deleted`,
        intent: "warning",
      });
  };

  let content;
  if (item.isPage) {
    content = (
      <div>
        <div className="result-item-content">{text}</div>
        {children.map((child) => {
          return (
            <Card
              interactive
              onClick={(e) => handlerClick(e, child)}
              className="result-item-child"
            >
              <div className="flex-row" data-uid={child.id}>
                <Icon icon="symbol-circle" size={10} />
                <div className="result-item-content" style={{ marginLeft: 10 }}>
                  {child.text}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  } else {
    content = (
      <>
        <div className="flex-row result-breadcrumbs">
          {path.map((s, index, ary) => {
            return (
              <span>
                {s}
                {index < ary.length - 1 ? (
                  <Icon
                    size={12}
                    style={{ margin: "0 4px" }}
                    icon="chevron-right"
                  />
                ) : null}
              </span>
            );
          })}
        </div>
        <div className="result-item-content">{text}</div>
      </>
    );
  }
  return (
    <section
      className="result-item-container"
      onClick={(e) => handlerClick(e, item)}
      data-uid={item.id}
    >
      <Icon icon={item.isPage ? "application" : "paragraph"}></Icon>
      <div style={{ width: "100%", marginLeft: 10 }}>
        {content}
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <span className="date date-fromnow">
            {date.fromNow(item.editTime)}
          </span>
          <span className="date date-common">{date.format(item.editTime)}</span>
        </div>
      </div>
    </section>
  );
});

const CheckboxAbleRow = observer((props: { item: QueryResultItem }) => {
  return (
    <Checkbox
      checked={store.ui.isSelectedTarget(props.item)}
      // onChange={() => store.actions.changeSelectedTarget(props.item)}
    >
      <Row {...props} />
    </Checkbox>
  );
});

const TargetCheckboxAbleRow = observer(
  (props: { item: ObservableObject<QueryResultItem> }) => {
    // console.log(props.item, " = item");
    return (
      <Checkbox
        checked={store.ui.isSelectedTarget(props.item.get())}
        onChange={() => store.actions.changeSelectedTarget(props.item)}
      >
        <Row item={props.item.get()} />
      </Checkbox>
    );
  }
);

export const QueryResult = observer(() => {
  const isMultipleSelection = store.ui.isMultipleSelection();
  let Item = Row;
  if (isMultipleSelection) {
    Item = CheckboxAbleRow;
  } else {
    Item = Row;
  }
  const list = store.ui.result.list();
  useLayoutEffect(() => {
    const el = [...document.querySelectorAll("[data-test-id]")].find(
      (el) => el.getAttribute("data-test-id") === "virtuoso-item-list"
    ) as HTMLElement;
    setTimeout(() => {
      const vHeight = el.getBoundingClientRect().height;

      // list.length > 20 ? MAX : list.length > 10 ? Math.min(MIN + 200, MAX) : MIN;
      // const height = MAX;
      // console.log(" lahyout effect", vHeight);
      store.actions.setHeight(vHeight);
    });
  }, [list]);
  console.log("render again", list);
  return (
    <Virtuoso
      className="infinite-scroll"
      style={store.ui.result.getListStyle()}
      totalCount={list.length}
      data={list}
      itemContent={(index, data) => (
        <Item
          key={getId(data) + index + getChildren(data).length}
          item={data}
        />
      )}
    ></Virtuoso>
  );
});

const SelectedResult = observer(() => {
  return (
    <div className="selected-result">
      {/* <For each={store.ui.copySelectedTarget()} item={TargetCheckboxAbleRow} /> */}
    </div>
  );
});

export const ListContainer = observer(() => {
  return (
    <div className="result-container">
      <div>
        <ButtonGroup className="sub-bg">
          {/* <Checkbox
                  checked={store.ui.isMultipleSelection()}
                  onChange={(e) => store.actions.toggleMultiple()}
                  label="Multiple Select"
                ></Checkbox>
                <Divider /> */}
          <Popover
            position={Position.BOTTOM}
            modifiers={{
              arrow: {
                enabled: false,
              },
            }}
            autoFocus={false}
            usePortal={usePortal()}
            content={
              <Menu>
                {store.ui.sort.selection().map((item, index) => {
                  return (
                    <MenuItem
                      onClick={() => store.actions.changeSort(index)}
                      text={item.text}
                    />
                  );
                })}
              </Menu>
            }
          >
            <div>
              Sort By:{" "}
              <Button
                rightIcon={<Icon icon="chevron-down" size={12} />}
                minimal
                text={store.ui.sort.selectedText()}
              ></Button>
            </div>
          </Popover>
        </ButtonGroup>
        <UnderMobile>
          <MobileSidebar />
        </UnderMobile>
      </div>
      <Divider />
      {store.ui.isLoading() && store.ui.result.size() === 0 ? (
        <div className="flex-row-center h-200">Searching...</div>
      ) : store.ui.hasResult() ? (
        <>
          <QueryResult />
        </>
      ) : (
        <div className="flex-row-center h-200">No results</div>
      )}
      {store.ui.isShowSelectedTarget() ? <SelectedResult /> : null}
    </div>
  );
});
