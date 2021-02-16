'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const React = require('react');
const clsx = require('clsx');
const reactDom = require('react-dom');

// @ts-nocheck
function useCombinedRefs(...refs) {
    return React.useCallback((handle) => {
        for (const ref of refs) {
            if (typeof ref === "function") {
                ref(handle);
            }
            else if (ref !== null) {
                ref.current = handle;
            }
        }
    }, 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs);
}

/**
 * Detecting outside click on a react component is surprisingly hard.
 * A general approach is to have a global click handler on the document
 * which checks if the click target is inside the editor container or
 * not using editorContainer.contains(e.target). This approach works well
 * until portals are used for editors. Portals render children into a DOM
 * node that exists outside the DOM hierarchy of the parent component so
 * editorContainer.contains(e.target) does not work. Here are some examples
 * of the DOM structure with different types of editors
 *
 *
 * SimpleEditor for example Texbox (No Portals)
 *   <div data-grid>..</div>
 *   <div portal-created-by-the-grid-for-editors>
 *      <div editor-container>
 *        <div simple-editor>..</div>
 *      </div>
 *   </div>
 *
 * ComplexEditor for example Modals (using Portals)
 *   <div data-grid>..</div>
 *   <div portal-created-by-the-grid-for-editors>
 *      <div editor-container>
 *        // Nothing here
 *      </div>
 *   </div>
 *   <div portal-created-by-the-editor>
 *     <div complex-editor>..</div>
 *   </div>
 *
 *
 * One approach to detect outside click is to use synthetic event bubbling through
 * portals. An event fired from inside a portal will propagate to ancestors
 * in the containing React tree, even if those elements are not ancestors
 * in the DOM tree. This means a click handler can be attached on the window
 * and on the editor container. The editor container can set a flag to notify
 * that the click was inside the editor and the window click handler can use
 * this flag to call onClickOutside. This approach however has a few caveats
 * - Click handler on the window is set using window.addEventListener
 * - Click handler on the editor container is set using onClick prop
 *
 * This means if a child component inside the editor calls e.stopPropagation
 * then the click handler on the editor container will not be called whereas
 * the document click handler will be called.
 * https://github.com/facebook/react/issues/12518
 *
 * To solve this issue onClickCapture event is used.
 */
function useClickOutside(onClick) {
    const frameRequestRef = React.useRef();
    function cancelAnimationFrameRequest() {
        if (typeof frameRequestRef.current === 'number') {
            cancelAnimationFrame(frameRequestRef.current);
            frameRequestRef.current = undefined;
        }
    }
    // We need to prevent the `useEffect` from cleaning up between re-renders,
    // as `handleDocumentClick` might otherwise miss valid click events.
    // To that end we instead access the latest `onClick` prop via a ref.
    const onClickRef = React.useRef(() => {
        throw new Error('Cannot call an event handler while rendering.');
    });
    React.useEffect(() => {
        onClickRef.current = onClick;
    });
    React.useEffect(() => {
        function onOutsideClick() {
            frameRequestRef.current = undefined;
            onClickRef.current();
        }
        function onWindowCaptureClick() {
            cancelAnimationFrameRequest();
            frameRequestRef.current = requestAnimationFrame(onOutsideClick);
        }
        window.addEventListener('click', onWindowCaptureClick, { capture: true });
        return () => {
            window.removeEventListener('click', onWindowCaptureClick, { capture: true });
            cancelAnimationFrameRequest();
        };
    }, []);
    return cancelAnimationFrameRequest;
}

function useGridDimensions() {
    const gridRef = React.useRef(null);
    const [gridWidth, setGridWidth] = React.useState(1);
    const [gridHeight, setGridHeight] = React.useState(1);
    React.useLayoutEffect(() => {
        const { ResizeObserver } = window;
        // don't break in jest/jsdom and browsers that don't support ResizeObserver
        if (ResizeObserver == null)
            return;
        const resizeObserver = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setGridWidth(width);
            setGridHeight(height);
        });
        resizeObserver.observe(gridRef.current);
        return () => {
            resizeObserver.disconnect();
        };
    }, []);
    return [gridRef, gridWidth, gridHeight];
}

function stopPropagation(event) {
    event.stopPropagation();
}
function wrapEvent(ourHandler, theirHandler) {
    if (theirHandler === undefined)
        return ourHandler;
    return function (event) {
        ourHandler(event);
        theirHandler(event);
    };
}

function useFocusRef(isCellSelected) {
    const ref = React.useRef(null);
    React.useLayoutEffect(() => {
        var _a;
        if (!isCellSelected)
            return;
        (_a = ref.current) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
    }, [isCellSelected]);
    return ref;
}

function SelectCellFormatter({ value, tabIndex, isCellSelected, disabled, onClick, onChange, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) {
    const inputRef = useFocusRef(isCellSelected);
    function handleChange(e) {
        onChange(e.target.checked, e.nativeEvent.shiftKey);
    }
    return (React.createElement("label", { className: clsx('rdg-checkbox-label', { 'rdg-checkbox-label-disabled': disabled }) },
        React.createElement("input", { "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, tabIndex: tabIndex, ref: inputRef, type: "checkbox", className: "rdg-checkbox-input", disabled: disabled, checked: value, onChange: handleChange, onClick: onClick }),
        React.createElement("div", { className: "rdg-checkbox" })));
}

function ValueFormatter(props) {
    try {
        return React.createElement(React.Fragment, null, props.row[props.column.key]);
    }
    catch {
        return null;
    }
}

function ToggleGroupFormatter({ groupKey, isExpanded, isCellSelected, toggleGroup }) {
    const cellRef = useFocusRef(isCellSelected);
    function handleKeyDown({ key }) {
        if (key === 'Enter') {
            toggleGroup();
        }
    }
    const d = isExpanded ? 'M1 1 L 7 7 L 13 1' : 'M1 7 L 7 1 L 13 7';
    return (React.createElement("span", { ref: cellRef, className: "rdg-group-cell-content", tabIndex: -1, onKeyDown: handleKeyDown },
        groupKey,
        React.createElement("svg", { viewBox: "0 0 14 8", width: "14", height: "8", className: "rdg-caret" },
            React.createElement("path", { d: d }))));
}

const SELECT_COLUMN_KEY = 'select-row';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SelectColumn = {
    key: SELECT_COLUMN_KEY,
    name: '',
    width: 35,
    maxWidth: 35,
    resizable: false,
    sortable: false,
    frozen: true,
    headerRenderer(props) {
        return (React.createElement(SelectCellFormatter, { "aria-label": "Select All", value: props.allRowsSelected, onChange: props.onAllRowsSelectionChange }));
    },
    formatter(props) {
        return (React.createElement(SelectCellFormatter, { "aria-label": "Select", tabIndex: -1, isCellSelected: props.isCellSelected, value: props.isRowSelected, onClick: stopPropagation, onChange: props.onRowSelectionChange }));
    },
    groupFormatter(props) {
        return (React.createElement(SelectCellFormatter, { "aria-label": "Select Group", tabIndex: -1, isCellSelected: props.isCellSelected, value: props.isRowSelected, onChange: props.onRowSelectionChange, 
            // Stop propagation to prevent row selection
            onClick: stopPropagation }));
    }
};

function getColumnMetrics(metrics) {
    let left = 0;
    let totalWidth = 0;
    let allocatedWidths = 0;
    let unassignedColumnsCount = 0;
    let lastFrozenColumnIndex = -1;
    let totalFrozenColumnWidth = 0;
    const { rawGroupBy } = metrics;
    const columns = metrics.rawColumns.map(metricsColumn => {
        let width = getSpecifiedWidth(metricsColumn, metrics.columnWidths, metrics.viewportWidth);
        if (width === undefined) {
            unassignedColumnsCount++;
        }
        else {
            width = clampColumnWidth(width, metricsColumn, metrics.minColumnWidth);
            allocatedWidths += width;
        }
        const column = { ...metricsColumn, width };
        if (rawGroupBy === null || rawGroupBy === void 0 ? void 0 : rawGroupBy.includes(column.key)) {
            column.frozen = true;
            column.rowGroup = true;
        }
        if (column.frozen) {
            lastFrozenColumnIndex++;
        }
        return column;
    });
    columns.sort(({ key: aKey, frozen: frozenA }, { key: bKey, frozen: frozenB }) => {
        // Sort select column first:
        if (aKey === SELECT_COLUMN_KEY)
            return -1;
        if (bKey === SELECT_COLUMN_KEY)
            return 1;
        // Sort grouped columns second, following the groupBy order:
        if (rawGroupBy === null || rawGroupBy === void 0 ? void 0 : rawGroupBy.includes(aKey)) {
            if (rawGroupBy.includes(bKey)) {
                return rawGroupBy.indexOf(aKey) - rawGroupBy.indexOf(bKey);
            }
            return -1;
        }
        if (rawGroupBy === null || rawGroupBy === void 0 ? void 0 : rawGroupBy.includes(bKey))
            return 1;
        // Sort frozen columns third:
        if (frozenA) {
            if (frozenB)
                return 0;
            return -1;
        }
        if (frozenB)
            return 1;
        // Sort other columns last:
        return 0;
    });
    const unallocatedWidth = metrics.viewportWidth - allocatedWidths;
    const unallocatedColumnWidth = Math.max(Math.floor(unallocatedWidth / unassignedColumnsCount), metrics.minColumnWidth);
    // Filter rawGroupBy and ignore keys that do not match the columns prop
    const groupBy = [];
    const calculatedColumns = columns.map((column, idx) => {
        var _a, _b, _c, _d, _e;
        // Every column should have a valid width as this stage
        const width = (_a = column.width) !== null && _a !== void 0 ? _a : clampColumnWidth(unallocatedColumnWidth, column, metrics.minColumnWidth);
        const newColumn = {
            ...column,
            idx,
            width,
            left,
            sortable: (_b = column.sortable) !== null && _b !== void 0 ? _b : metrics.defaultSortable,
            resizable: (_c = column.resizable) !== null && _c !== void 0 ? _c : metrics.defaultResizable,
            formatter: (_d = column.formatter) !== null && _d !== void 0 ? _d : metrics.defaultFormatter
        };
        if (newColumn.rowGroup) {
            groupBy.push(column.key);
            newColumn.groupFormatter = (_e = column.groupFormatter) !== null && _e !== void 0 ? _e : ToggleGroupFormatter;
        }
        totalWidth += width;
        left += width;
        return newColumn;
    });
    if (lastFrozenColumnIndex !== -1) {
        const lastFrozenColumn = calculatedColumns[lastFrozenColumnIndex];
        lastFrozenColumn.isLastFrozenColumn = true;
        totalFrozenColumnWidth = lastFrozenColumn.left + lastFrozenColumn.width;
    }
    return {
        columns: calculatedColumns,
        lastFrozenColumnIndex,
        totalFrozenColumnWidth,
        totalColumnWidth: totalWidth,
        groupBy
    };
}
function getSpecifiedWidth({ key, width }, columnWidths, viewportWidth) {
    if (columnWidths.has(key)) {
        // Use the resized width if available
        return columnWidths.get(key);
    }
    if (typeof width === 'number') {
        return width;
    }
    if (typeof width === 'string' && /^\d+%$/.test(width)) {
        return Math.floor(viewportWidth * parseInt(width, 10) / 100);
    }
    return undefined;
}
function clampColumnWidth(width, { minWidth, maxWidth }, minColumnWidth) {
    width = Math.max(width, minWidth !== null && minWidth !== void 0 ? minWidth : minColumnWidth);
    if (typeof maxWidth === 'number') {
        return Math.min(width, maxWidth);
    }
    return width;
}
function getColumnScrollPosition(columns, idx, currentScrollLeft, currentClientWidth) {
    let left = 0;
    let frozen = 0;
    for (let i = 0; i < idx; i++) {
        const column = columns[i];
        if (column) {
            if (column.width) {
                left += column.width;
            }
            if (column.frozen) {
                frozen += column.width;
            }
        }
    }
    const selectedColumn = columns[idx];
    if (selectedColumn) {
        const scrollLeft = left - frozen - currentScrollLeft;
        const scrollRight = left + selectedColumn.width - currentScrollLeft;
        if (scrollLeft < 0) {
            return scrollLeft;
        }
        if (scrollRight > currentClientWidth) {
            return scrollRight - currentClientWidth;
        }
    }
    return 0;
}
/**
 * By default, the following navigation keys are enabled while an editor is open, under specific conditions:
 * - Tab:
 *   - The editor must be an <input>, a <textarea>, or a <select> element.
 *   - The editor element must be the only immediate child of the editor container/a label.
 */
function onEditorNavigation({ key, target }) {
    if (key === 'Tab' && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return target.matches('.rdg-editor-container > :only-child, .rdg-editor-container > label:only-child > :only-child');
    }
    return false;
}

function isKeyPrintable(keycode) {
    return (keycode > 47 && keycode < 58) // number keys
        || keycode === 32 || keycode === 13 // spacebar & return key(s) (if you want to allow carriage returns)
        || (keycode > 64 && keycode < 91) // letter keys
        || (keycode > 95 && keycode < 112) // numpad keys
        || (keycode > 185 && keycode < 193) // ;=,-./` (in order)
        || (keycode > 218 && keycode < 223); // [\]' (in order)
}
function isCtrlKeyHeldDown(e) {
    return (e.ctrlKey || e.metaKey) && e.key !== 'Control';
}
function isDefaultCellInput(event) {
    return isKeyPrintable(event.keyCode) || ['Enter', 'F2', 'Backspace', 'Delete'].includes(event.key);
}

function isSelectedCellEditable({ selectedPosition, columns, rows, isGroupRow }) {
    const column = columns[selectedPosition.idx];
    const row = rows[selectedPosition.rowIdx];
    return column.editor != null
        && !column.rowGroup
        && !isGroupRow(row)
        && (typeof column.editable === 'function' ? column.editable(row) : column.editable) !== false;
}
function getNextSelectedCellPosition({ cellNavigationMode, columns, rowsCount, nextPosition }) {
    if (cellNavigationMode !== 'NONE') {
        const { idx, rowIdx } = nextPosition;
        const columnsCount = columns.length;
        const isAfterLastColumn = idx === columnsCount;
        const isBeforeFirstColumn = idx === -1;
        if (isAfterLastColumn) {
            if (cellNavigationMode === 'CHANGE_ROW') {
                const isLastRow = rowIdx === rowsCount - 1;
                if (!isLastRow) {
                    return {
                        idx: 0,
                        rowIdx: rowIdx + 1
                    };
                }
            }
            else if (cellNavigationMode === 'LOOP_OVER_ROW') {
                return {
                    rowIdx,
                    idx: 0
                };
            }
        }
        else if (isBeforeFirstColumn) {
            if (cellNavigationMode === 'CHANGE_ROW') {
                const isFirstRow = rowIdx === 0;
                if (!isFirstRow) {
                    return {
                        rowIdx: rowIdx - 1,
                        idx: columnsCount - 1
                    };
                }
            }
            else if (cellNavigationMode === 'LOOP_OVER_ROW') {
                return {
                    rowIdx,
                    idx: columnsCount - 1
                };
            }
        }
    }
    return nextPosition;
}
function canExitGrid({ cellNavigationMode, columns, rowsCount, selectedPosition: { rowIdx, idx }, shiftKey }) {
    // When the cellNavigationMode is 'none' or 'changeRow', you can exit the grid if you're at the first or last cell of the grid
    // When the cellNavigationMode is 'loopOverRow', there is no logical exit point so you can't exit the grid
    if (cellNavigationMode === 'NONE' || cellNavigationMode === 'CHANGE_ROW') {
        const atLastCellInRow = idx === columns.length - 1;
        const atFirstCellInRow = idx === 0;
        const atLastRow = rowIdx === rowsCount - 1;
        const atFirstRow = rowIdx === 0;
        return shiftKey ? atFirstCellInRow && atFirstRow : atLastCellInRow && atLastRow;
    }
    return false;
}

function assertIsValidKeyGetter(keyGetter) {
    if (typeof keyGetter !== 'function') {
        throw new Error('Please specify the rowKeyGetter prop to use selection');
    }
}

function useViewportColumns({ rawColumns, columnWidths, viewportWidth, scrollLeft, defaultColumnOptions, rawGroupBy, rowGrouper }) {
    var _a, _b, _c, _d;
    const minColumnWidth = (_a = defaultColumnOptions === null || defaultColumnOptions === void 0 ? void 0 : defaultColumnOptions.minWidth) !== null && _a !== void 0 ? _a : 80;
    const defaultFormatter = (_b = defaultColumnOptions === null || defaultColumnOptions === void 0 ? void 0 : defaultColumnOptions.formatter) !== null && _b !== void 0 ? _b : ValueFormatter;
    const defaultSortable = (_c = defaultColumnOptions === null || defaultColumnOptions === void 0 ? void 0 : defaultColumnOptions.sortable) !== null && _c !== void 0 ? _c : false;
    const defaultResizable = (_d = defaultColumnOptions === null || defaultColumnOptions === void 0 ? void 0 : defaultColumnOptions.resizable) !== null && _d !== void 0 ? _d : false;
    const { columns, lastFrozenColumnIndex, totalColumnWidth, totalFrozenColumnWidth, groupBy } = React.useMemo(() => {
        return getColumnMetrics({
            rawColumns,
            minColumnWidth,
            viewportWidth,
            columnWidths,
            defaultSortable,
            defaultResizable,
            defaultFormatter,
            rawGroupBy: rowGrouper ? rawGroupBy : undefined
        });
    }, [columnWidths, defaultFormatter, defaultResizable, defaultSortable, minColumnWidth, rawColumns, rawGroupBy, rowGrouper, viewportWidth]);
    const [colOverscanStartIdx, colOverscanEndIdx] = React.useMemo(() => {
        // get the viewport's left side and right side positions for non-frozen columns
        const viewportLeft = scrollLeft + totalFrozenColumnWidth;
        const viewportRight = scrollLeft + viewportWidth;
        // get first and last non-frozen column indexes
        const lastColIdx = columns.length - 1;
        const firstUnfrozenColumnIdx = Math.min(lastFrozenColumnIndex + 1, lastColIdx);
        // skip rendering non-frozen columns if the frozen columns cover the entire viewport
        if (viewportLeft >= viewportRight) {
            return [firstUnfrozenColumnIdx, firstUnfrozenColumnIdx];
        }
        // get the first visible non-frozen column index
        let colVisibleStartIdx = firstUnfrozenColumnIdx;
        while (colVisibleStartIdx < lastColIdx) {
            const { left, width } = columns[colVisibleStartIdx];
            // if the right side of the columnn is beyond the left side of the available viewport,
            // then it is the first column that's at least partially visible
            if (left + width > viewportLeft) {
                break;
            }
            colVisibleStartIdx++;
        }
        // get the last visible non-frozen column index
        let colVisibleEndIdx = colVisibleStartIdx;
        while (colVisibleEndIdx < lastColIdx) {
            const { left, width } = columns[colVisibleEndIdx];
            // if the right side of the column is beyond or equal to the right side of the available viewport,
            // then it the last column that's at least partially visible, as the previous column's right side is not beyond the viewport.
            if (left + width >= viewportRight) {
                break;
            }
            colVisibleEndIdx++;
        }
        const colOverscanStartIdx = Math.max(firstUnfrozenColumnIdx, colVisibleStartIdx - 1);
        const colOverscanEndIdx = Math.min(lastColIdx, colVisibleEndIdx + 1);
        return [colOverscanStartIdx, colOverscanEndIdx];
    }, [columns, lastFrozenColumnIndex, scrollLeft, totalFrozenColumnWidth, viewportWidth]);
    const viewportColumns = React.useMemo(() => {
        const viewportColumns = [];
        for (let colIdx = 0; colIdx <= colOverscanEndIdx; colIdx++) {
            const column = columns[colIdx];
            if (colIdx < colOverscanStartIdx && !column.frozen)
                continue;
            viewportColumns.push(column);
        }
        return viewportColumns;
    }, [colOverscanEndIdx, colOverscanStartIdx, columns]);
    return { columns, viewportColumns, totalColumnWidth, lastFrozenColumnIndex, totalFrozenColumnWidth, groupBy };
}

const RENDER_BACTCH_SIZE = 8;
function useViewportRows({ rawRows, rowHeight, clientHeight, scrollTop, groupBy, rowGrouper, expandedGroupIds }) {
    const [groupedRows, rowsCount] = React.useMemo(() => {
        if (groupBy.length === 0 || !rowGrouper)
            return [undefined, rawRows.length];
        const groupRows = (rows, [groupByKey, ...remainingGroupByKeys], startRowIndex) => {
            let groupRowsCount = 0;
            const groups = {};
            for (const [key, childRows] of Object.entries(rowGrouper(rows, groupByKey))) {
                // Recursively group each parent group
                const [childGroups, childRowsCount] = remainingGroupByKeys.length === 0
                    ? [childRows, childRows.length]
                    : groupRows(childRows, remainingGroupByKeys, startRowIndex + groupRowsCount + 1); // 1 for parent row
                groups[key] = { childRows, childGroups, startRowIndex: startRowIndex + groupRowsCount };
                groupRowsCount += childRowsCount + 1; // 1 for parent row
            }
            return [groups, groupRowsCount];
        };
        return groupRows(rawRows, groupBy, 0);
    }, [groupBy, rowGrouper, rawRows]);
    const [rows, allGroupRows] = React.useMemo(() => {
        const allGroupRows = new Set();
        if (!groupedRows)
            return [rawRows, allGroupRows];
        const flattenedRows = [];
        const expandGroup = (rows, parentId, level) => {
            if (Array.isArray(rows)) {
                flattenedRows.push(...rows);
                return;
            }
            Object.keys(rows).forEach((groupKey, posInSet, keys) => {
                var _a;
                // TODO: should users have control over the generated key?
                const id = parentId !== undefined ? `${parentId}__${groupKey}` : groupKey;
                const isExpanded = (_a = expandedGroupIds === null || expandedGroupIds === void 0 ? void 0 : expandedGroupIds.has(id)) !== null && _a !== void 0 ? _a : false;
                const { childRows, childGroups, startRowIndex } = rows[groupKey]; // https://github.com/microsoft/TypeScript/issues/17002
                const groupRow = {
                    id,
                    parentId,
                    groupKey,
                    isExpanded,
                    childRows,
                    level,
                    posInSet,
                    startRowIndex,
                    setSize: keys.length
                };
                flattenedRows.push(groupRow);
                allGroupRows.add(groupRow);
                if (isExpanded) {
                    expandGroup(childGroups, id, level + 1);
                }
            });
        };
        expandGroup(groupedRows, undefined, 0);
        return [flattenedRows, allGroupRows];
    }, [expandedGroupIds, groupedRows, rawRows]);
    const isGroupRow = (row) => allGroupRows.has(row);
    const overscanThreshold = 4;
    const rowVisibleStartIdx = Math.floor(scrollTop / rowHeight);
    const rowVisibleEndIdx = Math.min(rows.length - 1, Math.floor((scrollTop + clientHeight) / rowHeight));
    const rowOverscanStartIdx = Math.max(0, Math.floor((rowVisibleStartIdx - overscanThreshold) / RENDER_BACTCH_SIZE) * RENDER_BACTCH_SIZE);
    const rowOverscanEndIdx = Math.min(rows.length - 1, Math.ceil((rowVisibleEndIdx + overscanThreshold) / RENDER_BACTCH_SIZE) * RENDER_BACTCH_SIZE);
    return {
        rowOverscanStartIdx,
        rowOverscanEndIdx,
        rows,
        rowsCount,
        isGroupRow
    };
}

class EventBus {
    constructor() {
        this.subscribers = new Map();
    }
    subscribe(type, handler) {
        if (!this.subscribers.has(type)) {
            this.subscribers.set(type, new Set());
        }
        const handlers = this.subscribers.get(type);
        handlers.add(handler);
        return () => {
            handlers.delete(handler);
        };
    }
    dispatch(type, ...args) {
        const handlers = this.subscribers.get(type);
        if (handlers) {
            // handler needed a type assertion to fix type bug
            handlers.forEach(handler => {
                handler(...args);
            });
        }
    }
}

const SORT_TEXT = {
    ASC: '\u25B2',
    DESC: '\u25BC',
    NONE: ''
};
function SortableHeaderCell({ column, onSort, sortColumn, sortDirection, children }) {
    sortDirection = sortColumn === column.key && sortDirection || 'NONE';
    function onClick() {
        if (!onSort)
            return;
        const { sortDescendingFirst } = column;
        let direction;
        switch (sortDirection) {
            case 'ASC':
                direction = sortDescendingFirst ? 'NONE' : 'DESC';
                break;
            case 'DESC':
                direction = sortDescendingFirst ? 'ASC' : 'NONE';
                break;
            default:
                direction = sortDescendingFirst ? 'DESC' : 'ASC';
                break;
        }
        onSort(column.key, direction);
    }
    return (React.createElement("span", { className: "rdg-header-sort-cell", onClick: onClick },
        React.createElement("span", { className: "rdg-header-sort-name" }, children),
        React.createElement("span", null, SORT_TEXT[sortDirection])));
}

function ResizableHeaderCell({ children, column, onResize }) {
    function onMouseDown(event) {
        if (event.button !== 0) {
            return;
        }
        const { currentTarget } = event;
        const { right } = currentTarget.getBoundingClientRect();
        const offset = right - event.clientX;
        if (offset > 11) { // +1px to account for the border size
            return;
        }
        const onMouseMove = (event) => {
            handleResize(event.clientX + offset, currentTarget);
        };
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        event.preventDefault();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }
    function onTouchStart(event) {
        const touch = event.changedTouches[0];
        const { identifier } = touch;
        const { currentTarget } = event;
        const { right } = currentTarget.getBoundingClientRect();
        const offset = right - touch.clientX;
        if (offset > 11) { // +1px to account for the border size
            return;
        }
        function getTouch(event) {
            for (const touch of event.changedTouches) {
                if (touch.identifier === identifier)
                    return touch;
            }
            return null;
        }
        const onTouchMove = (event) => {
            const touch = getTouch(event);
            if (touch) {
                handleResize(touch.clientX + offset, currentTarget);
            }
        };
        const onTouchEnd = (event) => {
            const touch = getTouch(event);
            if (!touch)
                return;
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
    }
    function handleResize(x, target) {
        const width = x - target.getBoundingClientRect().left;
        if (width > 0) {
            onResize(column, width);
        }
    }
    return React.cloneElement(children, {
        onMouseDown,
        onTouchStart,
        children: (React.createElement(React.Fragment, null,
            children.props.children,
            React.createElement("div", { className: "rdg-header-cell-resizer" })))
    });
}

function getAriaSort(sortDirection) {
    switch (sortDirection) {
        case 'ASC':
            return 'ascending';
        case 'DESC':
            return 'descending';
        default:
            return 'none';
    }
}
function HeaderCell({ column, onResize, allRowsSelected, onAllRowsSelectionChange, sortColumn, sortDirection, onSort }) {
    function getCell() {
        if (column.headerRenderer) {
            return React.createElement(column.headerRenderer, {
                column,
                sortColumn,
                sortDirection,
                onSort,
                allRowsSelected,
                onAllRowsSelectionChange
            });
        }
        if (column.sortable) {
            return (React.createElement(SortableHeaderCell, { column: column, onSort: onSort, sortColumn: sortColumn, sortDirection: sortDirection }, column.name));
        }
        return column.name;
    }
    let cell = getCell();
    const className = clsx('rdg-cell', column.headerCellClass, {
        'rdg-cell-frozen': column.frozen,
        'rdg-cell-frozen-last': column.isLastFrozenColumn
    });
    const style = {
        width: column.width,
        left: column.left
    };
    cell = (React.createElement("div", { role: "columnheader", "aria-colindex": column.idx + 1, "aria-sort": sortColumn === column.key ? getAriaSort(sortDirection) : undefined, className: className, style: style }, cell));
    if (column.resizable) {
        cell = (React.createElement(ResizableHeaderCell, { column: column, onResize: onResize }, cell));
    }
    return cell;
}

function HeaderRow({ columns, rows, rowKeyGetter, onSelectedRowsChange, allRowsSelected, onColumnResize, sortColumn, sortDirection, onSort }) {
    const handleAllRowsSelectionChange = React.useCallback((checked) => {
        if (!onSelectedRowsChange)
            return;
        assertIsValidKeyGetter(rowKeyGetter);
        const newSelectedRows = new Set();
        if (checked) {
            for (const row of rows) {
                newSelectedRows.add(rowKeyGetter(row));
            }
        }
        onSelectedRowsChange(newSelectedRows);
    }, [onSelectedRowsChange, rows, rowKeyGetter]);
    return (React.createElement("div", { role: "row", "aria-rowindex": 1, className: "rdg-header-row" }, columns.map(column => {
        return (React.createElement(HeaderCell, { key: column.key, column: column, onResize: onColumnResize, allRowsSelected: allRowsSelected, onAllRowsSelectionChange: handleAllRowsSelectionChange, onSort: onSort, sortColumn: sortColumn, sortDirection: sortDirection }));
    })));
}
const HeaderRow$1 = React.memo(HeaderRow);

function FilterRow({ columns, filters, onFiltersChange }) {
    function onChange(key, value) {
        const newFilters = { ...filters };
        newFilters[key] = value;
        onFiltersChange === null || onFiltersChange === void 0 ? void 0 : onFiltersChange(newFilters);
    }
    return (React.createElement("div", { role: "row", "aria-rowindex": 2, className: "rdg-filter-row" }, columns.map(column => {
        const { key } = column;
        const className = clsx('rdg-cell', {
            'rdg-cell-frozen': column.frozen,
            'rdg-cell-frozen-last': column.isLastFrozenColumn
        });
        const style = {
            width: column.width,
            left: column.left
        };
        return (React.createElement("div", { key: key, style: style, className: className }, column.filterRenderer && React.createElement(column.filterRenderer, {
            column,
            value: filters === null || filters === void 0 ? void 0 : filters[column.key],
            onChange: value => onChange(key, value)
        })));
    })));
}
const FilterRow$1 = React.memo(FilterRow);

function Cell({ className, column, isCellSelected, isCopied, isDraggedOver, isRowSelected, row, rowIdx, eventBus, dragHandleProps, onRowClick, onClick, onDoubleClick, onContextMenu, ...props }, ref) {
    const cellRef = React.useRef(null);
    const { cellClass } = column;
    className = clsx('rdg-cell', {
        'rdg-cell-frozen': column.frozen,
        'rdg-cell-frozen-last': column.isLastFrozenColumn,
        'rdg-cell-selected': isCellSelected,
        'rdg-cell-copied': isCopied,
        'rdg-cell-dragged-over': isDraggedOver
    }, typeof cellClass === 'function' ? cellClass(row) : cellClass, className);
    function selectCell(openEditor) {
        eventBus.dispatch('SelectCell', { idx: column.idx, rowIdx }, openEditor);
    }
    function handleClick() {
        var _a;
        selectCell((_a = column.editorOptions) === null || _a === void 0 ? void 0 : _a.editOnClick);
        onRowClick === null || onRowClick === void 0 ? void 0 : onRowClick(rowIdx, row, column);
    }
    function handleContextMenu() {
        selectCell();
    }
    function handleDoubleClick() {
        selectCell(true);
    }
    function onRowSelectionChange(checked, isShiftClick) {
        eventBus.dispatch('SelectRow', { rowIdx, checked, isShiftClick });
    }
    return (React.createElement("div", Object.assign({ role: "gridcell", "aria-colindex": column.idx + 1, "aria-selected": isCellSelected, ref: useCombinedRefs(cellRef, ref), className: className, style: {
            width: column.width,
            left: column.left
        }, onClick: wrapEvent(handleClick, onClick), onDoubleClick: wrapEvent(handleDoubleClick, onDoubleClick), onContextMenu: wrapEvent(handleContextMenu, onContextMenu) }, props), !column.rowGroup && (React.createElement(React.Fragment, null,
        React.createElement(column.formatter, { column: column, rowIdx: rowIdx, row: row, isCellSelected: isCellSelected, isRowSelected: isRowSelected, onRowSelectionChange: onRowSelectionChange }),
        dragHandleProps && (React.createElement("div", Object.assign({ className: "rdg-cell-drag-handle" }, dragHandleProps)))))));
}
const Cell$1 = React.memo(React.forwardRef(Cell));

function EditorContainer({ row, column, onRowChange, ...props }) {
    var _a;
    const onClickCapture = useClickOutside(() => onRowChange(row, true));
    if (column.editor === undefined)
        return null;
    const editor = (React.createElement("div", { className: "rdg-editor-container", onClickCapture: onClickCapture },
        React.createElement(column.editor, Object.assign({ row: row, column: column, onRowChange: onRowChange }, props))));
    if ((_a = column.editorOptions) === null || _a === void 0 ? void 0 : _a.createPortal) {
        return reactDom.createPortal(editor, props.editorPortalTarget);
    }
    return editor;
}

function EditCell({ className, column, row, rowIdx, editorProps, ...props }) {
    const [dimensions, setDimensions] = React.useState(null);
    const cellRef = React.useCallback(node => {
        if (node !== null) {
            const { left, top } = node.getBoundingClientRect();
            setDimensions({ left, top });
        }
    }, []);
    const { cellClass } = column;
    className = clsx('rdg-cell', {
        'rdg-cell-frozen': column.frozen,
        'rdg-cell-frozen-last': column.isLastFrozenColumn
    }, 'rdg-cell-selected', 'rdg-cell-editing', typeof cellClass === 'function' ? cellClass(row) : cellClass, className);
    function getCellContent() {
        var _a;
        if (dimensions === null)
            return;
        const { scrollTop: docTop, scrollLeft: docLeft } = (_a = document.scrollingElement) !== null && _a !== void 0 ? _a : document.documentElement;
        const { left, top } = dimensions;
        const gridLeft = left + docLeft;
        const gridTop = top + docTop;
        return (React.createElement(EditorContainer, Object.assign({}, editorProps, { rowIdx: rowIdx, column: column, left: gridLeft, top: gridTop })));
    }
    return (React.createElement("div", Object.assign({ role: "gridcell", "aria-colindex": column.idx + 1, "aria-selected": true, ref: cellRef, className: className, style: {
            width: column.width,
            left: column.left
        } }, props), getCellContent()));
}

function Row({ cellRenderer: CellRenderer = Cell$1, className, eventBus, rowIdx, isRowSelected, copiedCellIdx, draggedOverCellIdx, row, viewportColumns, selectedCellProps, onRowClick, rowClass, setDraggedOverRowIdx, onMouseEnter, top, 'aria-rowindex': ariaRowIndex, 'aria-selected': ariaSelected, ...props }, ref) {
    function handleDragEnter() {
        setDraggedOverRowIdx === null || setDraggedOverRowIdx === void 0 ? void 0 : setDraggedOverRowIdx(rowIdx);
    }
    className = clsx('rdg-row', `rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'}`, {
        'rdg-row-selected': isRowSelected,
        'rdg-group-row-selected': (selectedCellProps === null || selectedCellProps === void 0 ? void 0 : selectedCellProps.idx) === -1
    }, rowClass === null || rowClass === void 0 ? void 0 : rowClass(row), className);
    return (React.createElement("div", Object.assign({ role: "row", "aria-rowindex": ariaRowIndex, "aria-selected": ariaSelected, ref: ref, className: className, onMouseEnter: wrapEvent(handleDragEnter, onMouseEnter), style: { top } }, props), viewportColumns.map(column => {
        const isCellSelected = (selectedCellProps === null || selectedCellProps === void 0 ? void 0 : selectedCellProps.idx) === column.idx;
        if ((selectedCellProps === null || selectedCellProps === void 0 ? void 0 : selectedCellProps.mode) === 'EDIT' && isCellSelected) {
            return (React.createElement(EditCell, { key: column.key, rowIdx: rowIdx, column: column, row: row, onKeyDown: selectedCellProps.onKeyDown, editorProps: selectedCellProps.editorProps }));
        }
        return (React.createElement(CellRenderer, { key: column.key, rowIdx: rowIdx, column: column, row: row, isCopied: copiedCellIdx === column.idx, isDraggedOver: draggedOverCellIdx === column.idx, isCellSelected: isCellSelected, isRowSelected: isRowSelected, eventBus: eventBus, dragHandleProps: isCellSelected ? selectedCellProps.dragHandleProps : undefined, onFocus: isCellSelected ? selectedCellProps.onFocus : undefined, onKeyDown: isCellSelected ? selectedCellProps.onKeyDown : undefined, onRowClick: onRowClick }));
    })));
}
const Row$1 = React.memo(React.forwardRef(Row));

function GroupCell({ id, rowIdx, groupKey, childRows, isExpanded, isCellSelected, isRowSelected, eventBus, column, groupColumnIndex }) {
    function toggleGroup() {
        eventBus.dispatch('ToggleGroup', id);
    }
    function onRowSelectionChange(checked) {
        eventBus.dispatch('SelectRow', { rowIdx, checked, isShiftClick: false });
    }
    // Only make the cell clickable if the group level matches
    const isLevelMatching = column.rowGroup && groupColumnIndex === column.idx;
    return (React.createElement("div", { role: "gridcell", "aria-colindex": column.idx + 1, key: column.key, className: clsx('rdg-cell', {
            'rdg-cell-frozen': column.frozen,
            'rdg-cell-frozen-last': column.isLastFrozenColumn,
            'rdg-cell-selected': isCellSelected
        }), style: {
            width: column.width,
            left: column.left,
            cursor: isLevelMatching ? 'pointer' : 'default'
        }, onClick: isLevelMatching ? toggleGroup : undefined }, column.groupFormatter && (!column.rowGroup || groupColumnIndex === column.idx) && (React.createElement(column.groupFormatter, { groupKey: groupKey, childRows: childRows, column: column, isExpanded: isExpanded, isCellSelected: isCellSelected, isRowSelected: isRowSelected, onRowSelectionChange: onRowSelectionChange, toggleGroup: toggleGroup }))));
}
const GroupCell$1 = React.memo(GroupCell);

function GroupedRow({ id, groupKey, viewportColumns, childRows, rowIdx, top, level, isExpanded, selectedCellIdx, isRowSelected, eventBus, ...props }) {
    // Select is always the first column
    const idx = viewportColumns[0].key === SELECT_COLUMN_KEY ? level + 1 : level;
    function selectGroup() {
        eventBus.dispatch('SelectCell', { rowIdx, idx: -1 });
    }
    return (React.createElement("div", Object.assign({ role: "row", "aria-level": level, "aria-expanded": isExpanded, className: clsx('rdg-row', 'rdg-group-row', `rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'}`, {
            'rdg-row-selected': isRowSelected,
            'rdg-group-row-selected': selectedCellIdx === -1 // Select row if there is no selected cell
        }), onClick: selectGroup, style: { top } }, props), viewportColumns.map(column => (React.createElement(GroupCell$1, { key: column.key, id: id, rowIdx: rowIdx, groupKey: groupKey, childRows: childRows, isExpanded: isExpanded, isRowSelected: isRowSelected, isCellSelected: selectedCellIdx === column.idx, eventBus: eventBus, column: column, groupColumnIndex: idx })))));
}
const GroupRowRenderer = React.memo(GroupedRow);

function SummaryCell({ column, row }) {
    const { summaryFormatter: SummaryFormatter, width, left, summaryCellClass } = column;
    const className = clsx('rdg-cell', {
        'rdg-cell-frozen': column.frozen,
        'rdg-cell-frozen-last': column.isLastFrozenColumn
    }, typeof summaryCellClass === 'function' ? summaryCellClass(row) : summaryCellClass);
    return (React.createElement("div", { role: "gridcell", "aria-colindex": column.idx + 1, className: className, style: { width, left } }, SummaryFormatter && React.createElement(SummaryFormatter, { column: column, row: row })));
}
const SummaryCell$1 = React.memo(SummaryCell);

function SummaryRow({ rowIdx, row, viewportColumns, bottom, 'aria-rowindex': ariaRowIndex }) {
    return (React.createElement("div", { role: "row", "aria-rowindex": ariaRowIndex, className: `rdg-row rdg-row-${rowIdx % 2 === 0 ? 'even' : 'odd'} rdg-summary-row`, style: { bottom } }, viewportColumns.map(column => (React.createElement(SummaryCell$1, { key: column.key, column: column, row: row })))));
}
const SummaryRow$1 = React.memo(SummaryRow);

/**
 * Main API Component to render a data grid of rows and columns
 *
 * @example
 *
 * <DataGrid columns={columns} rows={rows} />
*/
function DataGrid({ 
// Grid and data Props
columns: rawColumns, rows: rawRows, summaryRows, rowKeyGetter, onRowsChange, 
// Dimensions props
rowHeight = 35, headerRowHeight = rowHeight, headerFiltersHeight = 45, 
// Feature props
selectedRows, onSelectedRowsChange, sortColumn, sortDirection, onSort, filters, onFiltersChange, defaultColumnOptions, groupBy: rawGroupBy, rowGrouper, expandedGroupIds, onExpandedGroupIdsChange, 
// Custom renderers
rowRenderer: RowRenderer = Row$1, emptyRowsRenderer, 
// Event props
onRowClick, onScroll, onColumnResize, onSelectedCellChange, onFill, onPaste, 
// Toggles and modes
enableFilterRow = false, cellNavigationMode = 'NONE', 
// Miscellaneous
editorPortalTarget = document.body, className, style, rowClass, 
// ARIA
'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy }, ref) {
    var _a;
    /**
     * states
     */
    const [eventBus] = React.useState(() => new EventBus());
    const [scrollTop, setScrollTop] = React.useState(0);
    const [scrollLeft, setScrollLeft] = React.useState(0);
    const [columnWidths, setColumnWidths] = React.useState(() => new Map());
    const [selectedPosition, setSelectedPosition] = React.useState({ idx: -1, rowIdx: -1, mode: 'SELECT' });
    const [copiedCell, setCopiedCell] = React.useState(null);
    const [isDragging, setDragging] = React.useState(false);
    const [draggedOverRowIdx, setOverRowIdx] = React.useState(undefined);
    /**
     * refs
     */
    const focusSinkRef = React.useRef(null);
    const prevSelectedPosition = React.useRef(selectedPosition);
    const latestDraggedOverRowIdx = React.useRef(draggedOverRowIdx);
    const lastSelectedRowIdx = React.useRef(-1);
    const isCellFocusable = React.useRef(false);
    /**
     * computed values
     */
    const [gridRef, gridWidth, gridHeight] = useGridDimensions();
    const headerRowsCount = enableFilterRow ? 2 : 1;
    const summaryRowsCount = (_a = summaryRows === null || summaryRows === void 0 ? void 0 : summaryRows.length) !== null && _a !== void 0 ? _a : 0;
    const totalHeaderHeight = headerRowHeight + (enableFilterRow ? headerFiltersHeight : 0);
    const clientHeight = gridHeight - totalHeaderHeight - summaryRowsCount * rowHeight;
    const isSelectable = selectedRows !== undefined && onSelectedRowsChange !== undefined;
    const { columns, viewportColumns, totalColumnWidth, lastFrozenColumnIndex, totalFrozenColumnWidth, groupBy } = useViewportColumns({
        rawColumns,
        columnWidths,
        scrollLeft,
        viewportWidth: gridWidth,
        defaultColumnOptions,
        rawGroupBy,
        rowGrouper
    });
    const { rowOverscanStartIdx, rowOverscanEndIdx, rows, rowsCount, isGroupRow } = useViewportRows({
        rawRows,
        groupBy,
        rowGrouper,
        rowHeight,
        clientHeight,
        scrollTop,
        expandedGroupIds
    });
    const hasGroups = groupBy.length > 0 && rowGrouper;
    const minColIdx = hasGroups ? -1 : 0;
    // Cell drag is not supported on a treegrid
    const enableCellDragAndDrop = hasGroups ? false : onFill !== undefined;
    /**
     * effects
     */
    React.useLayoutEffect(() => {
        if (selectedPosition === prevSelectedPosition.current || selectedPosition.mode === 'EDIT' || !isCellWithinBounds(selectedPosition))
            return;
        prevSelectedPosition.current = selectedPosition;
        scrollToCell(selectedPosition);
        if (isCellFocusable.current) {
            isCellFocusable.current = false;
            return;
        }
        focusSinkRef.current.focus({ preventScroll: true });
    });
    React.useEffect(() => {
        if (!onSelectedRowsChange)
            return;
        const handleRowSelectionChange = ({ rowIdx, checked, isShiftClick }) => {
            assertIsValidKeyGetter(rowKeyGetter);
            const newSelectedRows = new Set(selectedRows);
            const row = rows[rowIdx];
            if (isGroupRow(row)) {
                for (const childRow of row.childRows) {
                    const rowKey = rowKeyGetter(childRow);
                    if (checked) {
                        newSelectedRows.add(rowKey);
                    }
                    else {
                        newSelectedRows.delete(rowKey);
                    }
                }
                onSelectedRowsChange(newSelectedRows);
                return;
            }
            const rowKey = rowKeyGetter(row);
            if (checked) {
                newSelectedRows.add(rowKey);
                const previousRowIdx = lastSelectedRowIdx.current;
                lastSelectedRowIdx.current = rowIdx;
                if (isShiftClick && previousRowIdx !== -1 && previousRowIdx !== rowIdx) {
                    const step = Math.sign(rowIdx - previousRowIdx);
                    for (let i = previousRowIdx + step; i !== rowIdx; i += step) {
                        const row = rows[i];
                        if (isGroupRow(row))
                            continue;
                        newSelectedRows.add(rowKeyGetter(row));
                    }
                }
            }
            else {
                newSelectedRows.delete(rowKey);
                lastSelectedRowIdx.current = -1;
            }
            onSelectedRowsChange(newSelectedRows);
        };
        return eventBus.subscribe('SelectRow', handleRowSelectionChange);
    });
    React.useEffect(() => {
        return eventBus.subscribe('SelectCell', selectCell);
    });
    React.useEffect(() => {
        if (!onExpandedGroupIdsChange)
            return;
        const toggleGroup = (expandedGroupId) => {
            const newExpandedGroupIds = new Set(expandedGroupIds);
            if (newExpandedGroupIds.has(expandedGroupId)) {
                newExpandedGroupIds.delete(expandedGroupId);
            }
            else {
                newExpandedGroupIds.add(expandedGroupId);
            }
            onExpandedGroupIdsChange(newExpandedGroupIds);
        };
        return eventBus.subscribe('ToggleGroup', toggleGroup);
    }, [eventBus, expandedGroupIds, onExpandedGroupIdsChange]);
    React.useImperativeHandle(ref, () => ({
        scrollToColumn(idx) {
            scrollToCell({ idx });
        },
        scrollToRow(rowIdx) {
            const { current } = gridRef;
            if (!current)
                return;
            current.scrollTo({
                top: rowIdx * rowHeight,
                behavior: 'smooth'
            });
        },
        selectCell
    }));
    /**
    * callbacks
    */
    const handleColumnResize = React.useCallback((column, width) => {
        const newColumnWidths = new Map(columnWidths);
        newColumnWidths.set(column.key, width);
        setColumnWidths(newColumnWidths);
        onColumnResize === null || onColumnResize === void 0 ? void 0 : onColumnResize(column.idx, width);
    }, [columnWidths, onColumnResize]);
    const setDraggedOverRowIdx = React.useCallback((rowIdx) => {
        setOverRowIdx(rowIdx);
        latestDraggedOverRowIdx.current = rowIdx;
    }, []);
    /**
    * event handlers
    */
    function handleKeyDown(event) {
        const { key, keyCode } = event;
        const row = rows[selectedPosition.rowIdx];
        if (onPaste
            && isCtrlKeyHeldDown(event)
            && isCellWithinBounds(selectedPosition)
            && !isGroupRow(row)
            && selectedPosition.idx !== -1
            && selectedPosition.mode === 'SELECT') {
            // event.key may differ by keyboard input language, so we use event.keyCode instead
            // event.nativeEvent.code cannot be used either as it would break copy/paste for the DVORAK layout
            const cKey = 67;
            const vKey = 86;
            if (keyCode === cKey) {
                handleCopy();
                return;
            }
            if (keyCode === vKey) {
                handlePaste();
                return;
            }
        }
        if (isCellWithinBounds(selectedPosition)
            && isGroupRow(row)
            && selectedPosition.idx === -1
            && (
            // Collapse the current group row if it is focused and is in expanded state
            (key === 'ArrowLeft' && row.isExpanded)
                // Expand the current group row if it is focused and is in collapsed state
                || (key === 'ArrowRight' && !row.isExpanded))) {
            event.preventDefault(); // Prevents scrolling
            eventBus.dispatch('ToggleGroup', row.id);
            return;
        }
        switch (event.key) {
            case 'Escape':
                setCopiedCell(null);
                closeEditor();
                return;
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'Tab':
            case 'Home':
            case 'End':
            case 'PageUp':
            case 'PageDown':
                navigate(event);
                break;
            default:
                handleCellInput(event);
                break;
        }
    }
    function handleFocus() {
        isCellFocusable.current = true;
    }
    function handleScroll(event) {
        const { scrollTop, scrollLeft } = event.currentTarget;
        setScrollTop(scrollTop);
        setScrollLeft(scrollLeft);
        onScroll === null || onScroll === void 0 ? void 0 : onScroll(event);
    }
    function getRawRowIdx(rowIdx) {
        return hasGroups ? rawRows.indexOf(rows[rowIdx]) : rowIdx;
    }
    function commitEditorChanges() {
        var _a;
        if (((_a = columns[selectedPosition.idx]) === null || _a === void 0 ? void 0 : _a.editor) === undefined
            || selectedPosition.mode === 'SELECT'
            || selectedPosition.row === selectedPosition.originalRow) {
            return;
        }
        const updatedRows = [...rawRows];
        updatedRows[getRawRowIdx(selectedPosition.rowIdx)] = selectedPosition.row;
        onRowsChange === null || onRowsChange === void 0 ? void 0 : onRowsChange(updatedRows);
    }
    function handleCopy() {
        const { idx, rowIdx } = selectedPosition;
        setCopiedCell({ row: rawRows[getRawRowIdx(rowIdx)], columnKey: columns[idx].key });
    }
    function handlePaste() {
        const { idx, rowIdx } = selectedPosition;
        const targetRow = rawRows[getRawRowIdx(rowIdx)];
        if (!onPaste
            || !onRowsChange
            || copiedCell === null
            || !isCellEditable(selectedPosition)) {
            return;
        }
        const updatedTargetRow = onPaste({
            sourceRow: copiedCell.row,
            sourceColumnKey: copiedCell.columnKey,
            targetRow,
            targetColumnKey: columns[idx].key
        });
        const updatedRows = [...rawRows];
        updatedRows[rowIdx] = updatedTargetRow;
        onRowsChange(updatedRows);
    }
    function handleCellInput(event) {
        var _a, _b;
        if (!isCellWithinBounds(selectedPosition))
            return;
        const row = rows[selectedPosition.rowIdx];
        if (isGroupRow(row))
            return;
        const { key } = event;
        const column = columns[selectedPosition.idx];
        if (selectedPosition.mode === 'EDIT') {
            if (key === 'Enter') {
                // Custom editors can listen for the event and stop propagation to prevent commit
                commitEditorChanges();
                closeEditor();
            }
            return;
        }
        (_b = (_a = column.editorOptions) === null || _a === void 0 ? void 0 : _a.onCellKeyDown) === null || _b === void 0 ? void 0 : _b.call(_a, event);
        if (event.isDefaultPrevented())
            return;
        if (isCellEditable(selectedPosition) && isDefaultCellInput(event)) {
            setSelectedPosition(({ idx, rowIdx }) => ({
                idx,
                rowIdx,
                key,
                mode: 'EDIT',
                row,
                originalRow: row
            }));
        }
    }
    function handleDragEnd() {
        const overRowIdx = latestDraggedOverRowIdx.current;
        if (overRowIdx === undefined || !onFill || !onRowsChange)
            return;
        const { idx, rowIdx } = selectedPosition;
        const sourceRow = rawRows[rowIdx];
        const startRowIndex = rowIdx < overRowIdx ? rowIdx + 1 : overRowIdx;
        const endRowIndex = rowIdx < overRowIdx ? overRowIdx + 1 : rowIdx;
        const targetRows = rawRows.slice(startRowIndex, endRowIndex);
        const updatedTargetRows = onFill({ columnKey: columns[idx].key, sourceRow, targetRows });
        const updatedRows = [...rawRows];
        for (let i = startRowIndex; i < endRowIndex; i++) {
            updatedRows[i] = updatedTargetRows[i - startRowIndex];
        }
        onRowsChange(updatedRows);
        setDraggedOverRowIdx(undefined);
    }
    function handleMouseDown(event) {
        if (event.buttons !== 1)
            return;
        setDragging(true);
        window.addEventListener('mouseover', onMouseOver);
        window.addEventListener('mouseup', onMouseUp);
        function onMouseOver(event) {
            // Trigger onMouseup in edge cases where we release the mouse button but `mouseup` isn't triggered,
            // for example when releasing the mouse button outside the iframe the grid is rendered in.
            // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
            if (event.buttons !== 1)
                onMouseUp();
        }
        function onMouseUp() {
            window.removeEventListener('mouseover', onMouseOver);
            window.removeEventListener('mouseup', onMouseUp);
            setDragging(false);
            handleDragEnd();
        }
    }
    function handleDoubleClick(event) {
        event.stopPropagation();
        if (!onFill || !onRowsChange)
            return;
        const { idx, rowIdx } = selectedPosition;
        const sourceRow = rawRows[rowIdx];
        const targetRows = rawRows.slice(rowIdx + 1);
        const updatedTargetRows = onFill({ columnKey: columns[idx].key, sourceRow, targetRows });
        const updatedRows = [...rawRows];
        for (let i = rowIdx + 1; i < updatedRows.length; i++) {
            updatedRows[i] = updatedTargetRows[i - rowIdx - 1];
        }
        onRowsChange(updatedRows);
    }
    function handleRowChange(row, commitChanges) {
        if (selectedPosition.mode === 'SELECT')
            return;
        if (commitChanges) {
            const updatedRows = [...rawRows];
            updatedRows[getRawRowIdx(selectedPosition.rowIdx)] = row;
            onRowsChange === null || onRowsChange === void 0 ? void 0 : onRowsChange(updatedRows);
            closeEditor();
        }
        else {
            setSelectedPosition(position => ({ ...position, row }));
        }
    }
    function handleOnClose(commitChanges) {
        if (commitChanges) {
            commitEditorChanges();
        }
        closeEditor();
    }
    /**
     * utils
     */
    function isCellWithinBounds({ idx, rowIdx }) {
        return rowIdx >= 0 && rowIdx < rows.length && idx >= minColIdx && idx < columns.length;
    }
    function isCellEditable(position) {
        return isCellWithinBounds(position)
            && isSelectedCellEditable({ columns, rows, selectedPosition: position, isGroupRow });
    }
    function selectCell(position, enableEditor = false) {
        if (!isCellWithinBounds(position))
            return;
        commitEditorChanges();
        if (enableEditor && isCellEditable(position)) {
            const row = rows[position.rowIdx];
            setSelectedPosition({ ...position, mode: 'EDIT', key: null, row, originalRow: row });
        }
        else {
            setSelectedPosition({ ...position, mode: 'SELECT' });
        }
        onSelectedCellChange === null || onSelectedCellChange === void 0 ? void 0 : onSelectedCellChange({ ...position });
    }
    function closeEditor() {
        if (selectedPosition.mode === 'SELECT')
            return;
        setSelectedPosition(({ idx, rowIdx }) => ({ idx, rowIdx, mode: 'SELECT' }));
    }
    function scrollToCell({ idx, rowIdx }) {
        const { current } = gridRef;
        if (!current)
            return;
        if (typeof idx === 'number' && idx > lastFrozenColumnIndex) {
            const { clientWidth } = current;
            const { left, width } = columns[idx];
            const isCellAtLeftBoundary = left < scrollLeft + width + totalFrozenColumnWidth;
            const isCellAtRightBoundary = left + width > clientWidth + scrollLeft;
            if (isCellAtLeftBoundary || isCellAtRightBoundary) {
                const newScrollLeft = getColumnScrollPosition(columns, idx, scrollLeft, clientWidth);
                current.scrollLeft = scrollLeft + newScrollLeft;
            }
        }
        if (typeof rowIdx === 'number') {
            if (rowIdx * rowHeight < scrollTop) {
                // at top boundary, scroll to the row's top
                current.scrollTop = rowIdx * rowHeight;
            }
            else if ((rowIdx + 1) * rowHeight > scrollTop + clientHeight) {
                // at bottom boundary, scroll the next row's top to the bottom of the viewport
                current.scrollTop = (rowIdx + 1) * rowHeight - clientHeight;
            }
        }
    }
    function getNextPosition(key, ctrlKey, shiftKey) {
        const { idx, rowIdx } = selectedPosition;
        const row = rows[rowIdx];
        const isRowSelected = isCellWithinBounds(selectedPosition) && idx === -1;
        // If a group row is focused, and it is collapsed, move to the parent group row (if there is one).
        if (key === 'ArrowLeft'
            && isRowSelected
            && isGroupRow(row)
            && !row.isExpanded
            && row.level !== 0) {
            let parentRowIdx = -1;
            for (let i = selectedPosition.rowIdx - 1; i >= 0; i--) {
                const parentRow = rows[i];
                if (isGroupRow(parentRow) && parentRow.id === row.parentId) {
                    parentRowIdx = i;
                    break;
                }
            }
            if (parentRowIdx !== -1) {
                return { idx, rowIdx: parentRowIdx };
            }
        }
        switch (key) {
            case 'ArrowUp':
                return { idx, rowIdx: rowIdx - 1 };
            case 'ArrowDown':
                return { idx, rowIdx: rowIdx + 1 };
            case 'ArrowLeft':
                return { idx: idx - 1, rowIdx };
            case 'ArrowRight':
                return { idx: idx + 1, rowIdx };
            case 'Tab':
                if (selectedPosition.idx === -1 && selectedPosition.rowIdx === -1) {
                    return shiftKey ? { idx: columns.length - 1, rowIdx: rows.length - 1 } : { idx: 0, rowIdx: 0 };
                }
                return { idx: idx + (shiftKey ? -1 : 1), rowIdx };
            case 'Home':
                // If row is selected then move focus to the first row
                if (isRowSelected)
                    return { idx, rowIdx: 0 };
                return ctrlKey ? { idx: 0, rowIdx: 0 } : { idx: 0, rowIdx };
            case 'End':
                // If row is selected then move focus to the last row.
                if (isRowSelected)
                    return { idx, rowIdx: rows.length - 1 };
                return ctrlKey ? { idx: columns.length - 1, rowIdx: rows.length - 1 } : { idx: columns.length - 1, rowIdx };
            case 'PageUp':
                return { idx, rowIdx: rowIdx - Math.floor(clientHeight / rowHeight) };
            case 'PageDown':
                return { idx, rowIdx: rowIdx + Math.floor(clientHeight / rowHeight) };
            default:
                return selectedPosition;
        }
    }
    function navigate(event) {
        var _a, _b;
        if (selectedPosition.mode === 'EDIT') {
            const onNavigation = (_b = (_a = columns[selectedPosition.idx].editorOptions) === null || _a === void 0 ? void 0 : _a.onNavigation) !== null && _b !== void 0 ? _b : onEditorNavigation;
            if (!onNavigation(event))
                return;
        }
        const { key, shiftKey } = event;
        const ctrlKey = isCtrlKeyHeldDown(event);
        let nextPosition = getNextPosition(key, ctrlKey, shiftKey);
        let mode = cellNavigationMode;
        if (key === 'Tab') {
            // If we are in a position to leave the grid, stop editing but stay in that cell
            if (canExitGrid({ shiftKey, cellNavigationMode, columns, rowsCount: rows.length, selectedPosition })) {
                // Allow focus to leave the grid so the next control in the tab order can be focused
                return;
            }
            mode = cellNavigationMode === 'NONE'
                ? 'CHANGE_ROW'
                : cellNavigationMode;
        }
        // Do not allow focus to leave
        event.preventDefault();
        nextPosition = getNextSelectedCellPosition({
            columns,
            rowsCount: rows.length,
            cellNavigationMode: mode,
            nextPosition
        });
        selectCell(nextPosition);
    }
    function getDraggedOverCellIdx(currentRowIdx) {
        if (draggedOverRowIdx === undefined)
            return;
        const { rowIdx } = selectedPosition;
        const isDraggedOver = rowIdx < draggedOverRowIdx
            ? rowIdx < currentRowIdx && currentRowIdx <= draggedOverRowIdx
            : rowIdx > currentRowIdx && currentRowIdx >= draggedOverRowIdx;
        return isDraggedOver ? selectedPosition.idx : undefined;
    }
    function getSelectedCellProps(rowIdx) {
        if (selectedPosition.rowIdx !== rowIdx)
            return;
        if (selectedPosition.mode === 'EDIT') {
            return {
                mode: 'EDIT',
                idx: selectedPosition.idx,
                onKeyDown: handleKeyDown,
                editorProps: {
                    editorPortalTarget,
                    rowHeight,
                    row: selectedPosition.row,
                    onRowChange: handleRowChange,
                    onClose: handleOnClose
                }
            };
        }
        return {
            mode: 'SELECT',
            idx: selectedPosition.idx,
            onFocus: handleFocus,
            onKeyDown: handleKeyDown,
            dragHandleProps: enableCellDragAndDrop && isCellEditable(selectedPosition)
                ? { onMouseDown: handleMouseDown, onDoubleClick: handleDoubleClick }
                : undefined
        };
    }
    function getViewportRows() {
        var _a;
        const rowElements = [];
        let startRowIndex = 0;
        for (let rowIdx = rowOverscanStartIdx; rowIdx <= rowOverscanEndIdx; rowIdx++) {
            const row = rows[rowIdx];
            const top = rowIdx * rowHeight + totalHeaderHeight;
            if (isGroupRow(row)) {
                ({ startRowIndex } = row);
                rowElements.push(React.createElement(GroupRowRenderer, { "aria-level": row.level + 1, "aria-setsize": row.setSize, "aria-posinset": row.posInSet + 1, "aria-rowindex": headerRowsCount + startRowIndex + 1, key: row.id, id: row.id, groupKey: row.groupKey, viewportColumns: viewportColumns, childRows: row.childRows, rowIdx: rowIdx, top: top, level: row.level, isExpanded: row.isExpanded, selectedCellIdx: selectedPosition.rowIdx === rowIdx ? selectedPosition.idx : undefined, isRowSelected: isSelectable && row.childRows.every(cr => selectedRows === null || selectedRows === void 0 ? void 0 : selectedRows.has(rowKeyGetter(cr))), eventBus: eventBus, onFocus: selectedPosition.rowIdx === rowIdx ? handleFocus : undefined, onKeyDown: selectedPosition.rowIdx === rowIdx ? handleKeyDown : undefined }));
                continue;
            }
            startRowIndex++;
            let key = hasGroups ? startRowIndex : rowIdx;
            let isRowSelected = false;
            if (typeof rowKeyGetter === 'function') {
                key = rowKeyGetter(row);
                isRowSelected = (_a = selectedRows === null || selectedRows === void 0 ? void 0 : selectedRows.has(key)) !== null && _a !== void 0 ? _a : false;
            }
            rowElements.push(React.createElement(RowRenderer, { "aria-rowindex": headerRowsCount + (hasGroups ? startRowIndex : rowIdx) + 1, "aria-selected": isSelectable ? isRowSelected : undefined, key: key, rowIdx: rowIdx, row: row, viewportColumns: viewportColumns, eventBus: eventBus, isRowSelected: isRowSelected, onRowClick: onRowClick, rowClass: rowClass, top: top, copiedCellIdx: copiedCell !== null && copiedCell.row === row ? columns.findIndex(c => c.key === copiedCell.columnKey) : undefined, draggedOverCellIdx: getDraggedOverCellIdx(rowIdx), setDraggedOverRowIdx: isDragging ? setDraggedOverRowIdx : undefined, selectedCellProps: getSelectedCellProps(rowIdx) }));
        }
        return rowElements;
    }
    // Reset the positions if the current values are no longer valid. This can happen if a column or row is removed
    if (selectedPosition.idx >= columns.length || selectedPosition.rowIdx >= rows.length) {
        setSelectedPosition({ idx: -1, rowIdx: -1, mode: 'SELECT' });
        setDraggedOverRowIdx(undefined);
    }
    if (selectedPosition.mode === 'EDIT' && rows[selectedPosition.rowIdx] !== selectedPosition.originalRow) {
        // Discard changes if rows are updated from outside
        closeEditor();
    }
    return (React.createElement("div", { role: hasGroups ? 'treegrid' : 'grid', "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, "aria-multiselectable": isSelectable ? true : undefined, "aria-colcount": columns.length, "aria-rowcount": headerRowsCount + rowsCount + summaryRowsCount, className: clsx('rdg', { 'rdg-viewport-dragging': isDragging }, className), style: {
            ...style,
            '--header-row-height': `${headerRowHeight}px`,
            '--filter-row-height': `${headerFiltersHeight}px`,
            '--row-width': `${totalColumnWidth}px`,
            '--row-height': `${rowHeight}px`
        }, ref: gridRef, onScroll: handleScroll },
        React.createElement(HeaderRow$1, { rowKeyGetter: rowKeyGetter, rows: rawRows, columns: viewportColumns, onColumnResize: handleColumnResize, allRowsSelected: (selectedRows === null || selectedRows === void 0 ? void 0 : selectedRows.size) === rawRows.length, onSelectedRowsChange: onSelectedRowsChange, sortColumn: sortColumn, sortDirection: sortDirection, onSort: onSort }),
        enableFilterRow && (React.createElement(FilterRow$1, { columns: viewportColumns, filters: filters, onFiltersChange: onFiltersChange })),
        rows.length === 0 && emptyRowsRenderer ? React.createElement(emptyRowsRenderer) : (React.createElement(React.Fragment, null,
            React.createElement("div", { ref: focusSinkRef, tabIndex: 0, className: "rdg-focus-sink", onKeyDown: handleKeyDown }),
            React.createElement("div", { style: { height: Math.max(rows.length * rowHeight, clientHeight) } }),
            getViewportRows(), summaryRows === null || summaryRows === void 0 ? void 0 :
            summaryRows.map((row, rowIdx) => (React.createElement(SummaryRow$1, { "aria-rowindex": headerRowsCount + rowsCount + rowIdx + 1, key: rowIdx, rowIdx: rowIdx, row: row, bottom: rowHeight * (summaryRows.length - 1 - rowIdx), viewportColumns: viewportColumns })))))));
}
const DataGrid$1 = React.forwardRef(DataGrid);

function autoFocusAndSelect(input) {
    input === null || input === void 0 ? void 0 : input.focus();
    input === null || input === void 0 ? void 0 : input.select();
}
function TextEditor({ row, column, onRowChange, onClose }) {
    return (React.createElement("input", { className: "rdg-text-editor", ref: autoFocusAndSelect, value: row[column.key], onChange: event => onRowChange({ ...row, [column.key]: event.target.value }), onBlur: () => onClose(true) }));
}

exports.Cell = Cell$1;
exports.Row = Row$1;
exports.SELECT_COLUMN_KEY = SELECT_COLUMN_KEY;
exports.SelectCellFormatter = SelectCellFormatter;
exports.SelectColumn = SelectColumn;
exports.SortableHeaderCell = SortableHeaderCell;
exports.TextEditor = TextEditor;
exports.ToggleGroupFormatter = ToggleGroupFormatter;
exports.ValueFormatter = ValueFormatter;
exports.default = DataGrid$1;
//# sourceMappingURL=bundle.cjs.map
