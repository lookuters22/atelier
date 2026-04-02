import { createContext, useContext, useRef, useEffect, useState, useCallback } from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { motion } from "framer-motion"

const CollapsibleOpenCtx = createContext(false)

function Collapsible({
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const isOpen = controlledOpen ?? internalOpen

  const handleChange = (v: boolean) => {
    setInternalOpen(v)
    onOpenChange?.(v)
  }

  return (
    <CollapsibleOpenCtx.Provider value={isOpen}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        open={isOpen}
        onOpenChange={handleChange}
        {...props}
      />
    </CollapsibleOpenCtx.Provider>
  )
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

function AnimatedCollapsibleContent({
  children,
  className,
  ...rest
}: Omit<React.ComponentProps<"div">, "ref">) {
  const open = useContext(CollapsibleOpenCtx)
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  const measure = useCallback(() => {
    if (innerRef.current) setHeight(innerRef.current.scrollHeight)
  }, [])

  useEffect(() => {
    if (!innerRef.current) return
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [measure])

  return (
    <motion.div
      data-slot="collapsible-content"
      initial={false}
      animate={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
        filter: open ? "blur(0px)" : "blur(1.5px)",
      }}
      transition={{
        height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
        opacity: { duration: 0.18, ease: "easeOut", delay: open ? 0.04 : 0 },
        filter: { duration: 0.2, ease: "easeOut", delay: open ? 0.04 : 0 },
      }}
      style={{ overflow: "hidden", pointerEvents: open ? "auto" : "none" }}
      className={className}
      {...rest}
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, AnimatedCollapsibleContent }
