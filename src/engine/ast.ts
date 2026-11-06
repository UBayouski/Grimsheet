export const MAX_DEPTH = 200;

export type BinaryOperator = '+' | '-' | '*' | '/' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export interface CellNode {
  readonly kind: 'cell';
  readonly col: number; // 1..26, letter A..Z
  readonly row: number; // integer 0..1_000_000 (anything above 20 is out of the Sheet; larger rows are clamped)
}

export type Node =
  | { readonly kind: 'number'; readonly value: number } // finite, >= 0 (a leading '-' is a 'negate' node)
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | CellNode
  | { readonly kind: 'range'; readonly from: CellNode; readonly to: CellNode } // as written, not normalized
  | { readonly kind: 'name'; readonly name: string } // upper case; never TRUE, FALSE or a function
  | { readonly kind: 'negate'; readonly operand: Node }
  | {
      readonly kind: 'binary';
      readonly op: BinaryOperator;
      readonly left: Node;
      readonly right: Node;
    }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Node[] }; // upper-case name

/** True when the AST contains a name node SELF or a call to TOWARD, anywhere (including untaken IF branches). */
export function isRuleAst(root: Node): boolean {
  // Never throws: a malformed tree from plain JavaScript is refused with `false`.
  try {
    return containsRuleNode(root);
  } catch {
    return false;
  }
}

function containsRuleNode(root: Node): boolean {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    switch (node.kind) {
      case 'name':
        if (node.name === 'SELF') return true;
        break;
      case 'call':
        if (node.name === 'TOWARD') return true;
        stack.push(...node.args);
        break;
      case 'negate':
        stack.push(node.operand);
        break;
      case 'binary':
        stack.push(node.left, node.right);
        break;
      default:
        break;
    }
  }
  return false;
}
