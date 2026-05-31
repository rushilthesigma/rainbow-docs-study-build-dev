// Tiny wrapper that fades its children in on every change to `viewKey`.
// Built on top of the `.animate-view-fade` keyframe defined in
// index.css. The `key` prop forces React to remount the subtree when
// the view id changes, which retriggers the CSS animation - that's the
// whole trick. Outermost wrapper only; inner state (forms, scroll) lives
// in the parent app's state so it survives the swap.
//
// Usage:
//   <ViewFade viewKey={view} className="h-full flex flex-col">
//     {view === 'list' && <ListView />}
//     {view === 'editor' && <EditorView />}
//   </ViewFade>
export default function ViewFade({ viewKey, children, className = '' }) {
  return (
    <div key={viewKey} className={`animate-view-fade ${className}`}>
      {children}
    </div>
  );
}
