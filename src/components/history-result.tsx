import { Button, Icon } from "@blueprintjs/core";
import { ObservableObject } from "@legendapp/state";
import { observer, For } from "@legendapp/state/react";
import { CONSTNATS } from "../helper";
import { opens } from "../roam";
import { store } from "../store";

type Item = ObservableObject<{ text: string; id: string }>;

const HistoryItem = observer(({ item }: { item: Item }) => {
  return (
    <Button
      minimal
      alignText="left"
      className="query-history-item"
      icon="search"
      onClick={() => {
        store.actions.useHistory(item.text.peek());
      }}
      rightIcon={
        <Icon
          className=""
          onClick={(e) => {
            e.preventDefault();
            store.actions.history.deleteSearch(item.id.peek());
          }}
          icon="small-cross"
        />
      }
      fill
      text={item.text}
    />
  );
});

const RecentlyViewedItem = observer(
  ({ item }: { item: ObservableObject<RecentlyViewedItem> }) => {
    return (
      <Button
        minimal
        alignText="left"
        className="query-history-item"
        onClick={(e) => {
          // store.actions.useHistory(item.text.peek());
          if (e.shiftKey) {
            opens.sidebar(item.id.peek());
          } else {
            opens.main.page(item.id.peek());
          }
          store.actions.toggleDialog()
        }}
        rightIcon={
          <Icon
            className=""
            onClick={(e) => {
              e.preventDefault();
              store.actions.history.deleteViewedItem(item.id.peek());
            }}
            icon="small-cross"
          />
        }
        fill
        text={item.text}
      />
    );
  }
);

export const QueryHistory = observer(() => {
  return (
    <div className={CONSTNATS.history}>
      {store.ui.history.getViewed().get().length > 0 ? (
        <section>
          <div className="header">
            <div>Recently Viewed</div>
            <Button text="Clear" minimal small onClick={store.actions.history.clearViewed} />
          </div>
          <For each={store.ui.history.getViewed()} item={RecentlyViewedItem} />
        </section>
      ) : null}

      {store.ui.history.getSearch().get().length > 0 ? (
        <section>
          <div className="header">
            <div>Latest search</div>
            <Button text="Clear" minimal small onClick={store.actions.history.clearSearch} />
          </div>
          <div>
            <For each={store.ui.history.getSearch()} item={HistoryItem}></For>
          </div>
        </section>
      ) : null}
    </div>
  );
});
