import { Button, Icon } from "@blueprintjs/core";
import { ObservableObject } from "@legendapp/state";
import { observer, For } from "@legendapp/state/react";
import { opens } from "../roam";
import { store } from "../store";

type Item = ObservableObject<{ text: string; id: string }>;
const HistoryItem = observer(({ item }: { item: Item }) => {
  return (
    <Button
      minimal
      alignText="left"
      className="query-history-item"
      onClick={() => {
        store.actions.useHistory(item.text.peek());
      }}
      rightIcon={
        <Icon
          className=""
          onClick={(e) => {
            e.preventDefault();
            store.actions.deleteHistory(item.id.peek());
          }}
          icon="small-cross"
        />
      }
      fill
      text={item.text}
    />
  );
});

const RecentlyViewedItem = observer(({ item }: { item: Item }) => {
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
});

export const QueryHistory = observer(() => {
  return (
    <div>
      <div>
        <div>Recently Viewed</div>
        <For each={store.ui.history.getViewed()} item={RecentlyViewedItem} />
      </div>

      <div>
        <div>
          <div>Latest search</div>
        </div>
        <div>
          <For each={store.ui.getHistory().search} item={HistoryItem}></For>
        </div>
      </div>
    </div>
  );
});
