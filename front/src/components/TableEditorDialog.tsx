// src/components/TableEditorDialog.tsx
'use client';

import { Dialog, DialogTitle, DialogContent } from '@mui/material';
import TableEditor from './TableEditor';
import { Table } from './types';

interface Props {
    open: boolean;
    table: Table;
    onClose: () => void;
    onSave: (table: Table, renameFrom?: string, renameTo?: string) => void;
}

export default function TableEditorDialog({ open, table, onClose, onSave }: Props) {
    const isNewTable = !table.name;
    const initialTableName = table.name;

    const handleSave = (updatedTable: Table) => {
        const renameFrom = initialTableName && initialTableName !== updatedTable.name
            ? initialTableName
            : '';
        const renameTo = renameFrom ? updatedTable.name : '';

        onSave(updatedTable, renameFrom, renameTo);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{isNewTable ? 'Create Table' : 'Edit Table'}</DialogTitle>
            <DialogContent>
                <TableEditor
                    table={table}
                    onSave={handleSave}
                    onCancel={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}


