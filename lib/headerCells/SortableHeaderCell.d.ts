import React from 'react';
import { HeaderCellProps } from '../HeaderCell';
declare type SharedHeaderCellProps<R, SR> = Pick<HeaderCellProps<R, SR>, 'column' | 'sortColumn' | 'sortDirection' | 'onSort'>;
export interface Props<R, SR> extends SharedHeaderCellProps<R, SR> {
    children: React.ReactNode;
}
export default function SortableHeaderCell<R, SR>({ column, onSort, sortColumn, sortDirection, children }: Props<R, SR>): JSX.Element;
export {};
