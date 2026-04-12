// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '../src/components/table';

describe('Table', () => {
  describe('Table component', () => {
    it('should render table with wrapper div', () => {
      const { container } = render(
        <Table>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </Table>
      );

      const wrapper = container.querySelector('div');
      const table = container.querySelector('table');

      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveClass('relative');
      expect(wrapper).toHaveClass('w-full');
      expect(wrapper).toHaveClass('overflow-auto');
      expect(table).toBeInTheDocument();
    });

    it('should render table with default classes', () => {
      const ref = createRef<HTMLTableElement>();
      const { container } = render(
        <Table ref={ref}>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </Table>
      );

      const table = ref.current;
      expect(table).toBeInTheDocument();
      expect(table).toHaveClass('w-full');
      expect(table).toHaveClass('caption-bottom');
      expect(table).toHaveClass('text-sm');
    });

    it('should render children correctly', () => {
      render(
        <Table>
          <tbody>
            <tr>
              <td>Table Content</td>
            </tr>
          </tbody>
        </Table>
      );
      expect(screen.getByText('Table Content')).toBeInTheDocument();
    });

    it('should apply custom className to table', () => {
      const ref = createRef<HTMLTableElement>();
      render(
        <Table ref={ref} className="custom-table">
          <tbody>
            <tr>
              <td>Test</td>
            </tr>
          </tbody>
        </Table>
      );

      expect(ref.current).toHaveClass('custom-table');
      expect(ref.current).toHaveClass('w-full');
    });

    it('should forward ref to table element', () => {
      const ref = createRef<HTMLTableElement>();
      render(
        <Table ref={ref}>
          <tbody>
            <tr>
              <td>Test</td>
            </tr>
          </tbody>
        </Table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableElement);
      expect(ref.current?.tagName).toBe('TABLE');
    });

    it('should pass through HTML attributes', () => {
      const ref = createRef<HTMLTableElement>();
      render(
        <Table ref={ref} id="test-table" role="grid">
          <tbody>
            <tr>
              <td>Test</td>
            </tr>
          </tbody>
        </Table>
      );

      expect(ref.current).toHaveAttribute('id', 'test-table');
      expect(ref.current).toHaveAttribute('role', 'grid');
    });

    it('should have correct display name', () => {
      expect(Table.displayName).toBe('Table');
    });
  });

  describe('TableHeader component', () => {
    it('should render as thead element with default classes', () => {
      const { container } = render(
        <table>
          <TableHeader>
            <tr>
              <th>Header</th>
            </tr>
          </TableHeader>
        </table>
      );

      const thead = container.querySelector('thead');
      expect(thead).toBeInTheDocument();
      expect(thead).toHaveClass('[&_tr]:border-b');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <TableHeader>
            <tr>
              <th>Column Header</th>
            </tr>
          </TableHeader>
        </table>
      );
      expect(screen.getByText('Column Header')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableHeader ref={ref} className="custom-header">
            <tr>
              <th>Test</th>
            </tr>
          </TableHeader>
        </table>
      );

      expect(ref.current).toHaveClass('custom-header');
      expect(ref.current).toHaveClass('[&_tr]:border-b');
    });

    it('should forward ref to thead element', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableHeader ref={ref}>
            <tr>
              <th>Test</th>
            </tr>
          </TableHeader>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableSectionElement);
      expect(ref.current?.tagName).toBe('THEAD');
    });

    it('should have correct display name', () => {
      expect(TableHeader.displayName).toBe('TableHeader');
    });
  });

  describe('TableBody component', () => {
    it('should render as tbody element with default classes', () => {
      const { container } = render(
        <table>
          <TableBody>
            <tr>
              <td>Cell</td>
            </tr>
          </TableBody>
        </table>
      );

      const tbody = container.querySelector('tbody');
      expect(tbody).toBeInTheDocument();
      expect(tbody).toHaveClass('[&_tr:last-child]:border-0');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <TableBody>
            <tr>
              <td>Body Content</td>
            </tr>
          </TableBody>
        </table>
      );
      expect(screen.getByText('Body Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableBody ref={ref} className="custom-body">
            <tr>
              <td>Test</td>
            </tr>
          </TableBody>
        </table>
      );

      expect(ref.current).toHaveClass('custom-body');
      expect(ref.current).toHaveClass('[&_tr:last-child]:border-0');
    });

    it('should forward ref to tbody element', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableBody ref={ref}>
            <tr>
              <td>Test</td>
            </tr>
          </TableBody>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableSectionElement);
      expect(ref.current?.tagName).toBe('TBODY');
    });

    it('should have correct display name', () => {
      expect(TableBody.displayName).toBe('TableBody');
    });
  });

  describe('TableFooter component', () => {
    it('should render as tfoot element with default classes', () => {
      const { container } = render(
        <table>
          <TableFooter>
            <tr>
              <td>Footer</td>
            </tr>
          </TableFooter>
        </table>
      );

      const tfoot = container.querySelector('tfoot');
      expect(tfoot).toBeInTheDocument();
      expect(tfoot).toHaveClass('border-t');
      expect(tfoot).toHaveClass('bg-muted/50');
      expect(tfoot).toHaveClass('font-medium');
      expect(tfoot).toHaveClass('[&>tr]:last:border-b-0');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <TableFooter>
            <tr>
              <td>Footer Content</td>
            </tr>
          </TableFooter>
        </table>
      );
      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableFooter ref={ref} className="custom-footer">
            <tr>
              <td>Test</td>
            </tr>
          </TableFooter>
        </table>
      );

      expect(ref.current).toHaveClass('custom-footer');
      expect(ref.current).toHaveClass('border-t');
    });

    it('should forward ref to tfoot element', () => {
      const ref = createRef<HTMLTableSectionElement>();
      render(
        <table>
          <TableFooter ref={ref}>
            <tr>
              <td>Test</td>
            </tr>
          </TableFooter>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableSectionElement);
      expect(ref.current?.tagName).toBe('TFOOT');
    });

    it('should have correct display name', () => {
      expect(TableFooter.displayName).toBe('TableFooter');
    });
  });

  describe('TableRow component', () => {
    it('should render as tr element with default classes', () => {
      const { container } = render(
        <table>
          <tbody>
            <TableRow>
              <td>Cell</td>
            </TableRow>
          </tbody>
        </table>
      );

      const tr = container.querySelector('tr');
      expect(tr).toBeInTheDocument();
      expect(tr).toHaveClass('border-b');
      expect(tr).toHaveClass('transition-colors');
      expect(tr).toHaveClass('hover:bg-muted/50');
      expect(tr).toHaveClass('data-[state=selected]:bg-muted');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <tbody>
            <TableRow>
              <td>Row Content</td>
            </TableRow>
          </tbody>
        </table>
      );
      expect(screen.getByText('Row Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableRowElement>();
      render(
        <table>
          <tbody>
            <TableRow ref={ref} className="custom-row">
              <td>Test</td>
            </TableRow>
          </tbody>
        </table>
      );

      expect(ref.current).toHaveClass('custom-row');
      expect(ref.current).toHaveClass('border-b');
    });

    it('should support selected state via data attribute', () => {
      const { container } = render(
        <table>
          <tbody>
            <TableRow data-state="selected">
              <td>Selected Row</td>
            </TableRow>
          </tbody>
        </table>
      );

      const tr = container.querySelector('tr');
      expect(tr).toHaveAttribute('data-state', 'selected');
      expect(tr).toHaveClass('data-[state=selected]:bg-muted');
    });

    it('should forward ref to tr element', () => {
      const ref = createRef<HTMLTableRowElement>();
      render(
        <table>
          <tbody>
            <TableRow ref={ref}>
              <td>Test</td>
            </TableRow>
          </tbody>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableRowElement);
      expect(ref.current?.tagName).toBe('TR');
    });

    it('should have correct display name', () => {
      expect(TableRow.displayName).toBe('TableRow');
    });
  });

  describe('TableHead component', () => {
    it('should render as th element with default classes', () => {
      const { container } = render(
        <table>
          <thead>
            <tr>
              <TableHead>Header</TableHead>
            </tr>
          </thead>
        </table>
      );

      const th = container.querySelector('th');
      expect(th).toBeInTheDocument();
      expect(th).toHaveClass('h-12');
      expect(th).toHaveClass('px-4');
      expect(th).toHaveClass('text-left');
      expect(th).toHaveClass('align-middle');
      expect(th).toHaveClass('font-medium');
      expect(th).toHaveClass('text-muted-foreground');
      expect(th).toHaveClass('[&:has([role=checkbox])]:pr-0');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <thead>
            <tr>
              <TableHead>Column Name</TableHead>
            </tr>
          </thead>
        </table>
      );
      expect(screen.getByText('Column Name')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <thead>
            <tr>
              <TableHead ref={ref} className="custom-head">
                Test
              </TableHead>
            </tr>
          </thead>
        </table>
      );

      expect(ref.current).toHaveClass('custom-head');
      expect(ref.current).toHaveClass('h-12');
    });

    it('should forward ref to th element', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <thead>
            <tr>
              <TableHead ref={ref}>Test</TableHead>
            </tr>
          </thead>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableCellElement);
      expect(ref.current?.tagName).toBe('TH');
    });

    it('should support th-specific attributes', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <thead>
            <tr>
              <TableHead ref={ref} scope="col" colSpan={2}>
                Test
              </TableHead>
            </tr>
          </thead>
        </table>
      );

      expect(ref.current).toHaveAttribute('scope', 'col');
      expect(ref.current).toHaveAttribute('colspan', '2');
    });

    it('should have correct display name', () => {
      expect(TableHead.displayName).toBe('TableHead');
    });
  });

  describe('TableCell component', () => {
    it('should render as td element with default classes', () => {
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <TableCell>Cell</TableCell>
            </tr>
          </tbody>
        </table>
      );

      const td = container.querySelector('td');
      expect(td).toBeInTheDocument();
      expect(td).toHaveClass('p-4');
      expect(td).toHaveClass('align-middle');
      expect(td).toHaveClass('[&:has([role=checkbox])]:pr-0');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <tbody>
            <tr>
              <TableCell>Cell Content</TableCell>
            </tr>
          </tbody>
        </table>
      );
      expect(screen.getByText('Cell Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <tbody>
            <tr>
              <TableCell ref={ref} className="custom-cell">
                Test
              </TableCell>
            </tr>
          </tbody>
        </table>
      );

      expect(ref.current).toHaveClass('custom-cell');
      expect(ref.current).toHaveClass('p-4');
    });

    it('should forward ref to td element', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <tbody>
            <tr>
              <TableCell ref={ref}>Test</TableCell>
            </tr>
          </tbody>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableCellElement);
      expect(ref.current?.tagName).toBe('TD');
    });

    it('should support td-specific attributes', () => {
      const ref = createRef<HTMLTableCellElement>();
      render(
        <table>
          <tbody>
            <tr>
              <TableCell ref={ref} colSpan={3} rowSpan={2}>
                Test
              </TableCell>
            </tr>
          </tbody>
        </table>
      );

      expect(ref.current).toHaveAttribute('colspan', '3');
      expect(ref.current).toHaveAttribute('rowspan', '2');
    });

    it('should have correct display name', () => {
      expect(TableCell.displayName).toBe('TableCell');
    });
  });

  describe('TableCaption component', () => {
    it('should render as caption element with default classes', () => {
      const { container } = render(
        <table>
          <TableCaption>Table Caption</TableCaption>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </table>
      );

      const caption = container.querySelector('caption');
      expect(caption).toBeInTheDocument();
      expect(caption).toHaveClass('mt-4');
      expect(caption).toHaveClass('text-sm');
      expect(caption).toHaveClass('text-muted-foreground');
    });

    it('should render children correctly', () => {
      render(
        <table>
          <TableCaption>My Table Caption</TableCaption>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </table>
      );
      expect(screen.getByText('My Table Caption')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const ref = createRef<HTMLTableCaptionElement>();
      render(
        <table>
          <TableCaption ref={ref} className="custom-caption">
            Test
          </TableCaption>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </table>
      );

      expect(ref.current).toHaveClass('custom-caption');
      expect(ref.current).toHaveClass('mt-4');
    });

    it('should forward ref to caption element', () => {
      const ref = createRef<HTMLTableCaptionElement>();
      render(
        <table>
          <TableCaption ref={ref}>Test</TableCaption>
          <tbody>
            <tr>
              <td>Cell</td>
            </tr>
          </tbody>
        </table>
      );

      expect(ref.current).toBeInstanceOf(HTMLTableCaptionElement);
      expect(ref.current?.tagName).toBe('CAPTION');
    });

    it('should have correct display name', () => {
      expect(TableCaption.displayName).toBe('TableCaption');
    });
  });

  describe('Table composition', () => {
    it('should compose all table parts together', () => {
      render(
        <Table>
          <TableCaption>Employee List</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>John Doe</TableCell>
              <TableCell>john@example.com</TableCell>
              <TableCell>Developer</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Jane Smith</TableCell>
              <TableCell>jane@example.com</TableCell>
              <TableCell>Designer</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>2 employees total</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      expect(screen.getByText('Employee List')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      expect(screen.getByText('Designer')).toBeInTheDocument();
      expect(screen.getByText('2 employees total')).toBeInTheDocument();
    });

    it('should maintain proper semantic table structure', () => {
      const { container } = render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Header</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Body</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      const table = container.querySelector('table');
      const thead = table?.querySelector('thead');
      const tbody = table?.querySelector('tbody');
      const tfoot = table?.querySelector('tfoot');

      expect(table).toBeInTheDocument();
      expect(thead).toBeInTheDocument();
      expect(tbody).toBeInTheDocument();
      expect(tfoot).toBeInTheDocument();

      expect(thead?.querySelector('th')).toHaveTextContent('Header');
      expect(tbody?.querySelector('td')).toHaveTextContent('Body');
      expect(tfoot?.querySelector('td')).toHaveTextContent('Footer');
    });

    it('should render table without footer', () => {
      render(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Data</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByText('Column')).toBeInTheDocument();
      expect(screen.getByText('Data')).toBeInTheDocument();
    });

    it('should render table with multiple rows', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Row 1</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Row 2</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Row 3</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByText('Row 1')).toBeInTheDocument();
      expect(screen.getByText('Row 2')).toBeInTheDocument();
      expect(screen.getByText('Row 3')).toBeInTheDocument();
    });

    it('should handle selected row state', () => {
      const { container } = render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Normal Row</TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>Selected Row</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      const rows = container.querySelectorAll('tr');
      expect(rows[0]).not.toHaveAttribute('data-state');
      expect(rows[1]).toHaveAttribute('data-state', 'selected');
    });

    it('should render complex cell content', () => {
      render(
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>
                <div>
                  <strong>Name:</strong> John Doe
                </div>
              </TableCell>
              <TableCell>
                <button>Edit</button>
                <button>Delete</button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      );

      expect(screen.getByText('Name:')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should apply custom classes to all composed parts', () => {
      const { container } = render(
        <Table className="custom-table">
          <TableCaption className="custom-caption">Caption</TableCaption>
          <TableHeader className="custom-header">
            <TableRow className="custom-header-row">
              <TableHead className="custom-head">Header</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="custom-body">
            <TableRow className="custom-body-row">
              <TableCell className="custom-cell">Cell</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter className="custom-footer">
            <TableRow className="custom-footer-row">
              <TableCell className="custom-footer-cell">Footer</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      const table = container.querySelector('table');
      const caption = container.querySelector('caption');
      const thead = container.querySelector('thead');
      const tbody = container.querySelector('tbody');
      const tfoot = container.querySelector('tfoot');

      expect(table).toHaveClass('custom-table');
      expect(caption).toHaveClass('custom-caption');
      expect(thead).toHaveClass('custom-header');
      expect(tbody).toHaveClass('custom-body');
      expect(tfoot).toHaveClass('custom-footer');
    });
  });
});
