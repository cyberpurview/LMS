'use client'
import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

/** Keyboard focus is trapped inside the dialog; Escape and outside clicks close it. */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-navy/40 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6"
        >
          <Dialog.Title className="text-xl font-bold mb-5">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
