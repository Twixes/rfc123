"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"
import type { Comment } from "@/lib/github"
import { rehypeLineMarkers } from "@/lib/rehype-line-markers"
import { LineCommentBox } from "@/components/LineCommentBox"
import { ExistingLineComments } from "@/components/ExistingLineComments"

interface InlineCommentableMarkdownProps {
    content: string
    prNumber: number
    comments: Comment[]
    onCommentSubmit: (line: number, body: string) => Promise<void>
}

export function InlineCommentableMarkdown({
    content,
    prNumber,
    comments,
    onCommentSubmit,
}: InlineCommentableMarkdownProps) {
    const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null)
    const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null)
    const [commentText, setCommentText] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [selectedText, setSelectedText] = useState<string>("")
    const [lineOffsets, setLineOffsets] = useState<Map<number, number>>(new Map())
    const [replyingToLine, setReplyingToLine] = useState<number | null>(null)
    const [replyText, setReplyText] = useState("")
    const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
    const markdownRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const isSelectingRef = useRef(false)

    const lines = useMemo(() => content.split("\n"), [content])
    const commentBoxRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const [commentPositions, setCommentPositions] = useState<Map<number, number>>(new Map())

    // Identify which lines are inside code blocks
    const linesInCodeBlocks = useMemo(() => {
        const set = new Set<number>()
        let inCodeBlock = false
        let codeBlockStart = -1

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const trimmed = line.trim()

            // Detect code fence (``` or ~~~)
            if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
                if (!inCodeBlock) {
                    inCodeBlock = true
                    codeBlockStart = i
                } else {
                    // End of code block - add all lines between start and end
                    for (let j = codeBlockStart + 1; j < i; j++) {
                        set.add(j + 1) // +1 because line numbers are 1-indexed
                    }
                    inCodeBlock = false
                    codeBlockStart = -1
                }
            }
        }

        return set
    }, [lines])

    // Calculate line offsets after render using injected markers
    useEffect(() => {
        if (!markdownRef.current) return

        const offsets = new Map<number, number>()
        const markdownElement = markdownRef.current
        const containerRect = markdownElement.getBoundingClientRect()

        // Query all line markers and calculate their offsets
        for (let i = 1; i <= lines.length; i++) {
            const marker = document.getElementById(`line-marker-${i}`)
            if (marker) {
                const markerRect = marker.getBoundingClientRect()
                const offset = markerRect.top - containerRect.top + markdownElement.scrollTop
                offsets.set(i, offset)
            }
        }

        setLineOffsets(offsets)
    }, [content, lines.length, comments, activeLineIndex])

    // Helper to check if a line is hovered or has active comment box
    const isLineHovered = (props: { "data-line-element"?: number }) => {
        const lineNumber = props["data-line-element"]
        if (!lineNumber) return false

        // Highlight if hovered
        if (hoveredLineIndex !== null && lineNumber === hoveredLineIndex + 1) {
            return true
        }

        // Highlight if comment box is active for this line
        if (activeLineIndex !== null && lineNumber === activeLineIndex + 1) {
            return true
        }

        return false
    }

    // Helper to get hover styles
    const getHoverStyles = (isHovered: boolean, lineNumber?: number) => {
        // Always show cursor pointer if element has line number (is clickable)
        const baseStyles = lineNumber ? { cursor: "pointer" } : {}

        if (!isHovered) return baseStyles

        return {
            ...baseStyles,
            backgroundColor: "var(--gray-10)",
            paddingLeft: "0.5rem",
            marginLeft: "-0.5rem",
        }
    }

    // Handle clicking on a line in the markdown content
    const handleLineClick = (lineNumber: number) => {
        const lineIndex = lineNumber - 1
        setActiveLineIndex(lineIndex)
        setCommentText("")
        setSelectedText("")
    }

    // Group comments by line number
    const commentsByLine = useMemo(() => {
        const map = new Map<number, Comment[]>()
        for (const comment of comments) {
            if (comment.line) {
                const existing = map.get(comment.line) || []
                map.set(comment.line, [...existing, comment])
            }
        }
        return map
    }, [comments])

    // Calculate all comment box positions to prevent overlaps
    // We need to calculate all positions in a single pass because of cascading effects:
    // if box A is pushed down, it might force box B to move, which might force box C to move, etc.
    // This effect runs after render to ensure we have access to the actual DOM element heights.
    useEffect(() => {
        const positions = new Map<number, number>()

        // Collect all boxes that need positioning (both existing comments and active form)
        const boxesToPosition: Array<{
            lineNum: number
            ref: HTMLDivElement | null
            isActive: boolean
        }> = []

        // Add all existing comment boxes
        for (const ln of commentsByLine.keys()) {
            boxesToPosition.push({
                lineNum: ln,
                ref: commentBoxRefs.current.get(ln) || null,
                isActive: false,
            })
        }

        // Add the active comment form if present
        if (activeLineIndex !== null) {
            boxesToPosition.push({
                lineNum: activeLineIndex + 1,
                ref: commentBoxRefs.current.get(-1) || null,
                isActive: true,
            })
        }

        // Sort by line number to process top-to-bottom
        boxesToPosition.sort((a, b) => a.lineNum - b.lineNum)

        // Track the bottom edge of the last positioned box
        // This is the key insight: as we process boxes in order, we track where the previous
        // box ended, and if the next box would overlap, we push it down below the previous one.
        let lastBottom = 0

        for (const { lineNum, ref, isActive } of boxesToPosition) {
            const baseOffset = lineOffsets.get(lineNum) || 0
            let adjustedOffset = Math.max(baseOffset, lastBottom)

            // Store the calculated position
            positions.set(isActive ? -1 : lineNum, adjustedOffset)

            // Update lastBottom for the next iteration
            if (ref) {
                lastBottom = adjustedOffset + ref.offsetHeight + 8 // 8px gap between boxes
            }
        }

        setCommentPositions(positions)
    }, [lineOffsets, commentsByLine, activeLineIndex, replyingToLine])

    // Helper to get the position for a specific line
    const getCommentPosition = (lineNumber: number): number => {
        return commentPositions.get(lineNumber) || lineOffsets.get(lineNumber) || 0
    }

    // Handle mouse down to start selection tracking
    function handleMouseDown() {
        isSelectingRef.current = true
        if (tooltipRef.current) {
            tooltipRef.current.style.display = "none"
        }
    }

    // Handle mouse move during selection to update tooltip
    function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        if (!isSelectingRef.current || !tooltipRef.current) return

        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
            tooltipRef.current.style.display = "none"
            return
        }

        const selectedText = selection.toString().trim()
        if (!selectedText) {
            tooltipRef.current.style.display = "none"
            return
        }

        // Position tooltip above cursor and update text
        tooltipRef.current.style.display = "block"
        tooltipRef.current.style.left = `${e.clientX}px`
        tooltipRef.current.style.top = `${e.clientY - 24}px`
        tooltipRef.current.textContent = `Release mouse button to cite selection`
    }

    // Handle text selection to open comment box
    function handleTextSelection() {
        isSelectingRef.current = false
        if (tooltipRef.current) {
            tooltipRef.current.style.display = "none"
        }

        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || !selection.rangeCount) {
            return
        }

        const selectedText = selection.toString().trim()
        if (!selectedText) {
            return
        }

        // Find the line marker within the selection
        const range = selection.getRangeAt(0)
        const container = range.commonAncestorContainer

        // Walk up the DOM to find elements with line marker data
        let element: HTMLElement | null = container instanceof HTMLElement ? container : container.parentElement

        let lineNumber: number | null = null

        while (element && element !== markdownRef.current) {
            const lineAttr = element.getAttribute("data-line-element")
            if (lineAttr) {
                lineNumber = Number.parseInt(lineAttr, 10)
                break
            }
            element = element.parentElement
        }

        if (lineNumber !== null) {
            const lineIndex = lineNumber - 1
            setActiveLineIndex(lineIndex)
            setCommentText(`> ${selectedText}\n`)
            setSelectedText(selectedText)
            selection.removeAllRanges() // Clear the selection
        }
    }

    async function handleSubmit(lineIndex: number) {
        if (!commentText.trim()) return

        setIsSubmitting(true)
        try {
            await onCommentSubmit(lineIndex + 1, commentText)
            setCommentText("")
            setActiveLineIndex(null)
            setSelectedText("")
        } catch (error) {
            console.error("Error submitting comment:", error)
            alert("Failed to post comment")
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleReplySubmit(lineNumber: number) {
        if (!replyText.trim()) return

        setIsSubmitting(true)
        try {
            await onCommentSubmit(lineNumber, replyText)
            setReplyText("")
            setReplyingToLine(null)
        } catch (error) {
            console.error("Error submitting reply:", error)
            alert("Failed to post comment")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="relative grid grid-cols-[1fr_400px] gap-12">
            {/* Main content */}
            <div className="relative flex gap-2 min-w-0">
                {/* Line numbers column */}
                <div className="shrink-0 select-none relative" style={{ width: "50px" }}>
                    {lines.map((line, index) => {
                        const lineNumber = index + 1

                        // Skip empty lines unless they're inside a code block
                        if (line.trim() === "" && !linesInCodeBlocks.has(lineNumber)) {
                            return null
                        }

                        const lineOffset = lineOffsets.get(lineNumber)

                        // Don't render until we have the offset calculated
                        if (lineOffset === undefined) {
                            return null
                        }

                        const lineComments = commentsByLine.get(lineNumber) || []
                        const hasComments = lineComments.length > 0

                        return (
                            <button
                                key={index}
                                id={`line-${lineNumber}`}
                                ref={(el) => {
                                    if (el) {
                                        lineRefs.current.set(lineNumber, el)
                                    }
                                }}
                                type="button"
                                onClick={() => {
                                    setActiveLineIndex(index)
                                    setCommentText("")
                                    setSelectedText("")
                                }}
                                className="group flex items-center gap-2 pr-2 absolute cursor-pointer"
                                style={{
                                    top: `${lineOffset}px`,
                                    height: "1.5rem",
                                }}
                                onMouseEnter={() => setHoveredLineIndex(index)}
                                onMouseLeave={() => setHoveredLineIndex(null)}
                                aria-label={`Add comment to line ${lineNumber}`}
                            >
                                <div className="flex h-5 w-5 items-center justify-center border-[1.5px] border-black bg-white opacity-0 transition-all group-hover:opacity-100 group-hover:bg-black group-hover:text-white">
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <title>Add comment</title>
                                        <path
                                            strokeLinecap="square"
                                            strokeLinejoin="miter"
                                            strokeWidth={3}
                                            d="M12 4v16m8-8H4"
                                        />
                                    </svg>
                                </div>
                                <span
                                    className="font-mono text-xs font-bold transition-opacity"
                                    style={{
                                        color: hasComments ? "var(--magenta)" : "var(--gray-50)",
                                    }}
                                >
                                    {lineNumber}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Full markdown content. It's important that we render the Markdown as a whole, so that multi-line features like tables work correctly.
                Even though this makes calculating line positions harder. */}
                <div
                    ref={markdownRef}
                    className="prose prose-zinc max-w-none flex-1 min-w-0 overflow-x-auto relative"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleTextSelection}
                >
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeLineMarkers, rehypeHighlight]}
                        components={{
                            h1: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <h1
                                        className="mb-2 mt-6 text-3xl font-bold tracking-tight text-black"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </h1>
                                )
                            },
                            h2: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <h2
                                        className="mb-2 mt-5 text-2xl font-bold tracking-tight text-black"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </h2>
                                )
                            },
                            h3: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <h3
                                        className="mb-1 mt-4 text-xl font-bold tracking-tight text-black"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </h3>
                                )
                            },
                            p: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <p
                                        className="my-2 leading-relaxed"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </p>
                                )
                            },
                            a: ({ href, children }) => (
                                <a
                                    href={href}
                                    className="border-b-2 font-bold text-black transition-all hover:border-black"
                                    style={{ borderBottomColor: "var(--cyan)" }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {children}
                                </a>
                            ),
                            ul: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <ul
                                        className="my-2 ml-6 list-disc space-y-1 text-gray-90"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </ul>
                                )
                            },
                            ol: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <ol
                                        className="my-2 ml-6 list-decimal space-y-1 text-gray-90"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </ol>
                                )
                            },
                            li: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <li
                                        className="leading-relaxed text-gray-90"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </li>
                                )
                            },
                            code: ({ className, children, ...props }) => {
                                const isInline = !className
                                if (isInline) {
                                    return (
                                        <code
                                            className="border border-black px-1.5 py-0.5 font-mono text-sm font-bold text-black"
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    )
                                }
                                return (
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                )
                            },
                            pre: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <pre
                                        className="my-4 max-w-full overflow-x-auto border-2 whitespace-pre-wrap border-black bg-black p-4"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </pre>
                                )
                            },
                            blockquote: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                const hoverStyles = getHoverStyles(hovered, lineNumber)
                                return (
                                    <blockquote
                                        className="my-4 border-l-[3px] bg-gray-10 py-2 pl-4 pr-4 font-medium italic text-gray-90"
                                        style={{
                                            borderLeftColor: hovered ? "var(--yellow)" : "var(--magenta)",
                                            ...hoverStyles,
                                        }}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </blockquote>
                                )
                            },
                            table: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <div className="my-4 overflow-x-auto">
                                        <table
                                            className="min-w-full border-2 border-black"
                                            style={getHoverStyles(hovered, lineNumber)}
                                            onClick={() => lineNumber && handleLineClick(lineNumber)}
                                            onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                            onMouseLeave={() => setHoveredLineIndex(null)}
                                            {...props}
                                        >
                                            {children}
                                        </table>
                                    </div>
                                )
                            },
                            thead: ({ children, ...props }) => (
                                <thead className="bg-black text-white" {...props}>
                                    {children}
                                </thead>
                            ),
                            tbody: ({ children, ...props }) => (
                                <tbody className="divide-y divide-black bg-white" {...props}>
                                    {children}
                                </tbody>
                            ),
                            tr: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <tr
                                        className="border-black"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </tr>
                                )
                            },
                            th: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <th
                                        className="border border-black px-4 py-2 text-left text-sm font-bold tracking-wide text-white"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </th>
                                )
                            },
                            td: ({ children, ...props }) => {
                                const hovered = isLineHovered(props as any)
                                const lineNumber = (props as any)["data-line-element"]
                                return (
                                    <td
                                        className="border border-black px-4 py-2 text-sm text-gray-90"
                                        style={getHoverStyles(hovered, lineNumber)}
                                        onClick={() => lineNumber && handleLineClick(lineNumber)}
                                        onMouseEnter={() => lineNumber && setHoveredLineIndex(lineNumber - 1)}
                                        onMouseLeave={() => setHoveredLineIndex(null)}
                                        {...props}
                                    >
                                        {children}
                                    </td>
                                )
                            },
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </div>
            </div>

            {/* Comments sidebar */}
            <div className="relative">
                {activeLineIndex !== null && (
                    <LineCommentBox
                        lineNumber={activeLineIndex + 1}
                        commentText={commentText}
                        isSubmitting={isSubmitting}
                        position={commentPositions.get(-1) || lineOffsets.get(activeLineIndex + 1) || 0}
                        onCommentTextChange={setCommentText}
                        onClose={() => {
                            setActiveLineIndex(null)
                            setCommentText("")
                            setSelectedText("")
                        }}
                        onSubmit={() => handleSubmit(activeLineIndex)}
                        commentBoxRef={(el) => {
                            if (el) {
                                commentBoxRefs.current.set(-1, el)
                            }
                        }}
                    />
                )}

                {Array.from(commentsByLine.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([lineNumber, lineComments]) => (
                        <ExistingLineComments
                            key={lineNumber}
                            lineNumber={lineNumber}
                            comments={lineComments}
                            position={getCommentPosition(lineNumber)}
                            isReplying={replyingToLine === lineNumber}
                            replyText={replyText}
                            isSubmitting={isSubmitting}
                            onReplyTextChange={setReplyText}
                            onStartReply={() => {
                                setReplyingToLine(lineNumber)
                                setReplyText("")
                            }}
                            onCancelReply={() => {
                                setReplyingToLine(null)
                                setReplyText("")
                            }}
                            onSubmitReply={() => handleReplySubmit(lineNumber)}
                            commentBoxRef={(el) => {
                                if (el) {
                                    commentBoxRefs.current.set(lineNumber, el)
                                }
                            }}
                        />
                    ))}

                {/* Empty state */}
                {commentsByLine.size === 0 && activeLineIndex === null && (
                    <div
                        className="absolute top-0 border-2 border-dashed border-black bg-gray-10 p-6 text-center"
                        style={{ width: "400px" }}
                    >
                        <svg
                            className="mx-auto h-8 w-8 text-gray-30"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="square"
                                strokeLinejoin="miter"
                                strokeWidth={2}
                                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                            />
                        </svg>
                        <p className="mt-3 text-sm font-bold tracking-wide text-gray-50">No comments yet</p>
                        <p className="mt-1 text-xs font-medium text-gray-50">Click any line to add a comment</p>
                    </div>
                )}
            </div>

            {/* Selection tooltip */}
            <div
                ref={tooltipRef}
                className="pointer-events-none fixed z-50 border-2 border-black bg-white px-3 py-2 text-xs font-bold tracking-wide text-black shadow-lg"
                style={{
                    display: "none",
                    transform: "translate(-50%, -100%)",
                }}
            />
        </div>
    )
}
