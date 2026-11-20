<script setup lang="ts">
import { X } from '@lucide/vue'

interface TagCount {
  name: string
  count: number
}

const model = defineModel<string[]>({ required: true })
const { t } = useI18n()
const input = shallowRef('')
const error = shallowRef('')
const announcement = shallowRef('')
const isComposing = shallowRef(false)
const inputId = useId()
const descriptionId = useId()
const errorId = useId()
const listboxId = useId()
const inputElement = useTemplateRef('inputElement')

const existingTags = shallowRef<TagCount[]>([])
const tagsFetched = shallowRef(false)
const tagsFetching = shallowRef(false)
const isFocused = shallowRef(false)
const highlightedIndex = shallowRef(-1)
const dismissedQuery = shallowRef('')

async function fetchTags() {
  if (tagsFetched.value || tagsFetching.value)
    return
  tagsFetching.value = true
  try {
    existingTags.value = await useAPI<TagCount[]>('/api/link/tags')
    tagsFetched.value = true
  }
  catch (cause) {
    console.error(cause)
  }
  finally {
    tagsFetching.value = false
  }
}

const suggestions = computed(() => {
  const query = input.value.trim().toLowerCase()
  if (!query || query === dismissedQuery.value)
    return []
  return existingTags.value
    .filter(tag =>
      tag.name.toLowerCase().startsWith(query)
      && !model.value.some(existing => existing.toLowerCase() === tag.name.toLowerCase()),
    )
    .slice(0, 8)
})

watch(input, (value) => {
  if (value.trim().toLowerCase() !== dismissedQuery.value)
    dismissedQuery.value = ''
})

const isOpen = computed(() => suggestions.value.length > 0)

function optionId(index: number) {
  return `${listboxId}-option-${index}`
}

watch(suggestions, (current) => {
  if (highlightedIndex.value >= current.length)
    highlightedIndex.value = -1
})

function announce(message: string) {
  announcement.value = ''
  nextTick(() => {
    announcement.value = message
  })
}

function commit(): boolean {
  if (isComposing.value)
    return false

  const tag = input.value.trim().toLowerCase()
  error.value = ''

  if (!tag)
    return true

  if (tag.length > 32) {
    error.value = t('links.form.tag_too_long')
    return false
  }

  if (model.value.includes(tag)) {
    input.value = ''
    return true
  }

  if (model.value.length >= 10) {
    error.value = t('links.form.tags_limit')
    return false
  }

  model.value = [...model.value, tag]
  input.value = ''
  announce(t('links.form.tag_added', { tag }))
  return true
}

function removeTag(index: number) {
  const tag = model.value[index]
  model.value = model.value.filter((_, tagIndex) => tagIndex !== index)
  error.value = ''
  if (tag)
    announce(t('links.form.tag_removed', { tag }))
}

function selectSuggestion(suggestion: TagCount) {
  const tag = suggestion.name.toLowerCase()
  error.value = ''

  if (!model.value.includes(tag)) {
    if (model.value.length >= 10) {
      error.value = t('links.form.tags_limit')
      highlightedIndex.value = -1
      inputElement.value?.focus()
      return
    }
    model.value = [...model.value, tag]
    input.value = ''
    highlightedIndex.value = -1
    dismissedQuery.value = ''
    inputElement.value?.focus()
    announce(t('links.form.tag_added', { tag }))
    return
  }

  input.value = ''
  highlightedIndex.value = -1
  dismissedQuery.value = ''
  inputElement.value?.focus()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value)
    return

  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    const highlighted = suggestions.value[highlightedIndex.value]
    if (event.key === 'Enter' && highlighted) {
      selectSuggestion(highlighted)
    }
    else {
      highlightedIndex.value = -1
      dismissedQuery.value = ''
      commit()
    }
  }
  else if (event.key === 'ArrowDown' && isOpen.value) {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % suggestions.value.length
  }
  else if (event.key === 'ArrowUp' && isOpen.value) {
    event.preventDefault()
    const count = suggestions.value.length
    highlightedIndex.value = highlightedIndex.value < 0
      ? count - 1
      : (highlightedIndex.value - 1 + count) % count
  }
  else if (event.key === 'Escape') {
    highlightedIndex.value = -1
    dismissedQuery.value = input.value.trim().toLowerCase()
  }
  else if (event.key === 'Backspace' && !input.value && model.value.length) {
    removeTag(model.value.length - 1)
  }
}

function handleFocus() {
  isFocused.value = true
}

function handleBlur() {
  isFocused.value = false
  highlightedIndex.value = -1
  if (!isComposing.value)
    commit()
}

defineExpose({ commit })
</script>

<template>
  <Field>
    <FieldLabel :for="inputId">
      {{ $t('links.form.tags') }}
    </FieldLabel>
    <FieldDescription :id="descriptionId">
      {{ $t('links.form.tags_description') }}
    </FieldDescription>
    <div class="relative">
      <div
        class="
          flex min-h-9 flex-wrap items-center gap-1.5 rounded-4xl border
          border-input bg-input/30 px-2 py-1 text-sm transition-colors
          outline-none
          focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50
        "
        :aria-invalid="error ? 'true' : undefined"
      >
        <Badge
          v-for="(tag, index) in model"
          :key="tag"
          variant="secondary"
          class="
            h-10 max-w-full gap-1 py-0 pr-1
            sm:h-5
          "
        >
          <span class="truncate">{{ tag }}</span>
          <button
            type="button"
            class="
              inline-flex size-10 items-center justify-center rounded-full
              hover:bg-muted-foreground/20
              focus-visible:ring-2 focus-visible:ring-ring
              focus-visible:outline-none
              sm:size-5
            "
            :aria-label="$t('links.form.tag_remove', { tag })"
            @click="removeTag(index)"
          >
            <X class="size-3" aria-hidden="true" />
          </button>
        </Badge>
        <input
          :id="inputId"
          ref="inputElement"
          v-model="input"
          type="text"
          name="tags"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          class="
            h-7 min-w-28 flex-1 bg-transparent px-1 text-base outline-none
            placeholder:text-muted-foreground
            md:text-sm
          "
          :placeholder="$t('links.form.tags_placeholder')"
          :aria-describedby="`${descriptionId} ${error ? errorId : ''}`"
          :aria-invalid="error ? 'true' : undefined"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          :aria-controls="listboxId"
          :aria-activedescendant="
            highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined
          "
          @blur="handleBlur"
          @compositionend="isComposing = false"
          @compositionstart="isComposing = true"
          @focus="handleFocus"
          @input="fetchTags"
          @keydown="handleKeydown"
        >
      </div>
      <div
        v-if="isFocused && isOpen"
        :id="listboxId"
        role="listbox"
        :aria-label="$t('links.form.tags')"
        class="
          absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto
          rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1
          ring-foreground/5
        "
        @mousedown.prevent
      >
        <button
          v-for="(suggestion, index) in suggestions"
          :id="optionId(index)"
          :key="suggestion.name"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="index === highlightedIndex"
          class="
            flex w-full items-center rounded-xl px-2 py-1.5 text-left text-sm
          "
          :class="index === highlightedIndex
            ? 'bg-accent text-accent-foreground'
            : ''"
          @click="selectSuggestion(suggestion)"
          @mouseenter="highlightedIndex = index"
        >
          <span class="truncate">{{ suggestion.name }}</span>
          <span class="ml-auto pl-2 text-xs text-muted-foreground">
            {{ suggestion.count }}
          </span>
        </button>
      </div>
    </div>
    <p v-if="error" :id="errorId" class="text-sm text-destructive" role="alert" aria-live="polite">
      {{ error }}
    </p>
    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ announcement }}
    </p>
  </Field>
</template>
