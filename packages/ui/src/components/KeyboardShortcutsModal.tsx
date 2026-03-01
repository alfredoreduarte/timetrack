import React, { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { SHORTCUT_GROUPS } from "../hooks/useKeyboardShortcuts";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        {/* Modal panel */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="p-6 pb-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-xl font-semibold text-gray-900">
                      Keyboard Shortcuts
                    </Dialog.Title>
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-500 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Shortcut groups */}
                <div className="p-6 space-y-6">
                  {SHORTCUT_GROUPS.map((group) => (
                    <div key={group.title}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        {group.title}
                      </h3>
                      <div className="space-y-2">
                        {group.shortcuts.map((shortcut) => (
                          <div
                            key={shortcut.action}
                            className="flex items-center justify-between py-1.5"
                          >
                            <span className="text-sm text-gray-700">
                              {shortcut.action}
                            </span>
                            <span className="ml-4 flex items-center gap-1 flex-shrink-0">
                              {shortcut.keys.map((k, i) => (
                                <kbd
                                  key={i}
                                  className="inline-flex items-center px-2 py-1 text-xs font-mono font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded shadow-sm"
                                >
                                  {k}
                                </kbd>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default KeyboardShortcutsModal;
