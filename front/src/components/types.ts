// src/components/types.ts

export interface Field {
    name: string;
    type: string;
    nullable?: boolean;
    primaryKey?: boolean;
    default?: string;
    unique?: boolean;
    foreignKey?: {
        table: string;
        field: string;
        onDelete: 'RESTRICT' | 'CASCADE' | 'SET NULL';
    };
}

export interface Table {
    name: string;
    fields: Field[];
}

export interface Schema {
    tables: Table[];
}
