// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../src/components/card';

describe('Card', () => {
  describe('Card component', () => {
    it('should render with default classes', () => {
      const { container } = render(<Card data-testid="card">Test Content</Card>);
      const card = screen.getByTestId('card');

      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('text-card-foreground');
      expect(card).toHaveClass('shadow-sm');
    });

    it('should render children correctly', () => {
      render(<Card>Card Content</Card>);
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Card className="custom-class" data-testid="card">
          Test
        </Card>
      );
      const card = screen.getByTestId('card');

      expect(card).toHaveClass('custom-class');
      // Should still have default classes
      expect(card).toHaveClass('rounded-lg');
    });

    it('should forward ref to div element', () => {
      const ref = createRef<HTMLDivElement>();
      render(<Card ref={ref}>Test</Card>);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should pass through HTML attributes', () => {
      render(
        <Card data-testid="card" id="test-card" role="region">
          Test
        </Card>
      );
      const card = screen.getByTestId('card');

      expect(card).toHaveAttribute('id', 'test-card');
      expect(card).toHaveAttribute('role', 'region');
    });

    it('should have correct display name', () => {
      expect(Card.displayName).toBe('Card');
    });
  });

  describe('CardHeader component', () => {
    it('should render with default classes', () => {
      const { container } = render(<CardHeader data-testid="header">Header</CardHeader>);
      const header = screen.getByTestId('header');

      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
      expect(header).toHaveClass('space-y-1.5');
      expect(header).toHaveClass('p-6');
    });

    it('should render children correctly', () => {
      render(<CardHeader>Header Content</CardHeader>);
      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CardHeader className="custom-header" data-testid="header">
          Test
        </CardHeader>
      );
      const header = screen.getByTestId('header');

      expect(header).toHaveClass('custom-header');
      expect(header).toHaveClass('flex');
    });

    it('should forward ref to div element', () => {
      const ref = createRef<HTMLDivElement>();
      render(<CardHeader ref={ref}>Test</CardHeader>);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should have correct display name', () => {
      expect(CardHeader.displayName).toBe('CardHeader');
    });
  });

  describe('CardTitle component', () => {
    it('should render as h3 element with default classes', () => {
      render(<CardTitle>Title Text</CardTitle>);
      const title = screen.getByText('Title Text');

      expect(title).toBeInTheDocument();
      expect(title.tagName).toBe('H3');
      expect(title).toHaveClass('text-2xl');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });

    it('should render children correctly', () => {
      render(<CardTitle>My Card Title</CardTitle>);
      expect(screen.getByText('My Card Title')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<CardTitle className="custom-title">Test</CardTitle>);
      const title = screen.getByText('Test');

      expect(title).toHaveClass('custom-title');
      expect(title).toHaveClass('text-2xl');
    });

    it('should forward ref to h3 element', () => {
      const ref = createRef<HTMLParagraphElement>();
      render(<CardTitle ref={ref}>Test</CardTitle>);

      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
      expect(ref.current?.tagName).toBe('H3');
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should have correct display name', () => {
      expect(CardTitle.displayName).toBe('CardTitle');
    });
  });

  describe('CardDescription component', () => {
    it('should render as p element with default classes', () => {
      render(<CardDescription>Description Text</CardDescription>);
      const description = screen.getByText('Description Text');

      expect(description).toBeInTheDocument();
      expect(description.tagName).toBe('P');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });

    it('should render children correctly', () => {
      render(<CardDescription>My Card Description</CardDescription>);
      expect(screen.getByText('My Card Description')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<CardDescription className="custom-description">Test</CardDescription>);
      const description = screen.getByText('Test');

      expect(description).toHaveClass('custom-description');
      expect(description).toHaveClass('text-sm');
    });

    it('should forward ref to p element', () => {
      const ref = createRef<HTMLParagraphElement>();
      render(<CardDescription ref={ref}>Test</CardDescription>);

      expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should have correct display name', () => {
      expect(CardDescription.displayName).toBe('CardDescription');
    });
  });

  describe('CardContent component', () => {
    it('should render with default classes', () => {
      const { container } = render(<CardContent data-testid="content">Content</CardContent>);
      const content = screen.getByTestId('content');

      expect(content).toBeInTheDocument();
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('should render children correctly', () => {
      render(<CardContent>Card Content Text</CardContent>);
      expect(screen.getByText('Card Content Text')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CardContent className="custom-content" data-testid="content">
          Test
        </CardContent>
      );
      const content = screen.getByTestId('content');

      expect(content).toHaveClass('custom-content');
      expect(content).toHaveClass('p-6');
    });

    it('should forward ref to div element', () => {
      const ref = createRef<HTMLDivElement>();
      render(<CardContent ref={ref}>Test</CardContent>);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should have correct display name', () => {
      expect(CardContent.displayName).toBe('CardContent');
    });
  });

  describe('CardFooter component', () => {
    it('should render with default classes', () => {
      const { container } = render(<CardFooter data-testid="footer">Footer</CardFooter>);
      const footer = screen.getByTestId('footer');

      expect(footer).toBeInTheDocument();
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
      expect(footer).toHaveClass('pt-0');
    });

    it('should render children correctly', () => {
      render(<CardFooter>Footer Content</CardFooter>);
      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CardFooter className="custom-footer" data-testid="footer">
          Test
        </CardFooter>
      );
      const footer = screen.getByTestId('footer');

      expect(footer).toHaveClass('custom-footer');
      expect(footer).toHaveClass('flex');
    });

    it('should forward ref to div element', () => {
      const ref = createRef<HTMLDivElement>();
      render(<CardFooter ref={ref}>Test</CardFooter>);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.textContent).toBe('Test');
    });

    it('should have correct display name', () => {
      expect(CardFooter.displayName).toBe('CardFooter');
    });
  });

  describe('Card composition', () => {
    it('should compose all card parts together', () => {
      render(
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>Main content goes here</CardContent>
          <CardFooter>Footer actions</CardFooter>
        </Card>
      );

      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Description')).toBeInTheDocument();
      expect(screen.getByText('Main content goes here')).toBeInTheDocument();
      expect(screen.getByText('Footer actions')).toBeInTheDocument();
    });

    it('should render complex content structure', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>
              <span>Complex</span> <strong>Title</strong>
            </CardTitle>
            <CardDescription>
              <em>Styled</em> description
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <p>Paragraph 1</p>
              <p>Paragraph 2</p>
            </div>
          </CardContent>
          <CardFooter>
            <button>Action 1</button>
            <button>Action 2</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByText('Complex')).toBeInTheDocument();
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Styled')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
      expect(screen.getByText('Action 1')).toBeInTheDocument();
      expect(screen.getByText('Action 2')).toBeInTheDocument();
    });

    it('should render card with only some parts', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Minimal Card</CardTitle>
          </CardHeader>
          <CardContent>Just title and content</CardContent>
        </Card>
      );

      expect(screen.getByText('Minimal Card')).toBeInTheDocument();
      expect(screen.getByText('Just title and content')).toBeInTheDocument();
      expect(screen.queryByText('Footer')).not.toBeInTheDocument();
    });

    it('should maintain proper DOM hierarchy', () => {
      const { container } = render(
        <Card data-testid="card">
          <CardHeader data-testid="header">
            <CardTitle data-testid="title">Title</CardTitle>
          </CardHeader>
          <CardContent data-testid="content">Content</CardContent>
        </Card>
      );

      const card = screen.getByTestId('card');
      const header = screen.getByTestId('header');
      const title = screen.getByTestId('title');
      const content = screen.getByTestId('content');

      expect(card).toContainElement(header);
      expect(card).toContainElement(content);
      expect(header).toContainElement(title);
    });

    it('should apply custom classes to all composed parts', () => {
      render(
        <Card className="card-custom" data-testid="card">
          <CardHeader className="header-custom" data-testid="header">
            <CardTitle className="title-custom">Title</CardTitle>
            <CardDescription className="desc-custom">Description</CardDescription>
          </CardHeader>
          <CardContent className="content-custom" data-testid="content">
            Content
          </CardContent>
          <CardFooter className="footer-custom" data-testid="footer">
            Footer
          </CardFooter>
        </Card>
      );

      expect(screen.getByTestId('card')).toHaveClass('card-custom');
      expect(screen.getByTestId('header')).toHaveClass('header-custom');
      expect(screen.getByText('Title')).toHaveClass('title-custom');
      expect(screen.getByText('Description')).toHaveClass('desc-custom');
      expect(screen.getByTestId('content')).toHaveClass('content-custom');
      expect(screen.getByTestId('footer')).toHaveClass('footer-custom');
    });
  });
});
