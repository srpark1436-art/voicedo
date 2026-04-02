import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

export const useTodoStore = create(
  persist(
    (set, get) => ({
      username: '',
      userId: null,
      todos: [],
      filter: 'all', // 'all' | 'today' | 'completed'
      isOnline: navigator.onLine,
      voiceEditTodoId: null,

      setUsername: (username) => set({ username }),
      setUserId: (userId) => set({ userId }),
      setFilter: (filter) => set({ filter }),
      setOnline: (isOnline) => set({ isOnline }),
      setVoiceEditTodoId: (id) => set({ voiceEditTodoId: id }),
      clearUser: () => set({ username: '', userId: null, todos: [] }),

      // Supabase에서 할일 목록 불러오기 + 3개월 지난 완료 할일 자동 삭제
      fetchTodos: async () => {
        const { userId } = get()
        if (!userId) return

        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!error && data) {
          const threeMonthsAgo = new Date()
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
          const cutoff = threeMonthsAgo.toISOString()

          const oldCompleted = data.filter(t => t.is_completed && t.created_at < cutoff)
          const remaining = data.filter(t => !(t.is_completed && t.created_at < cutoff))

          set({ todos: remaining })

          if (oldCompleted.length > 0) {
            const ids = oldCompleted.map(t => t.id)
            supabase.from('todos').delete().in('id', ids).then(({ error: delErr }) => {
              if (delErr) console.error('오래된 완료 할일 삭제 실패:', delErr)
            })
          }
        }
      },

      // 할일 추가
      addTodo: async ({ content, deadline, deadline_time, priority = 'medium' }) => {
        const { username, userId, todos } = get()
        if (!username || !content.trim()) return null

        const newTodo = {
          user_id: userId,
          username,
          content: content.trim(),
          deadline: deadline || null,
          deadline_time: deadline_time || null,
          priority,
          is_completed: false,
          created_at: new Date().toISOString(),
        }

        // 낙관적 업데이트 (오프라인 지원)
        const tempId = `temp-${Date.now()}`
        const optimisticTodo = { ...newTodo, id: tempId }
        set({ todos: [optimisticTodo, ...todos] })

        const { data, error } = await supabase
          .from('todos')
          .insert(newTodo)
          .select()
          .single()

        if (error) {
          // 실패 시 낙관적 업데이트 롤백
          set({ todos: get().todos.filter((t) => t.id !== tempId) })
          console.error('할일 추가 실패:', error)
          return null
        }

        // 실제 데이터로 교체
        set({
          todos: get().todos.map((t) => (t.id === tempId ? data : t)),
        })
        return data
      },

      // 완료 상태 토글
      toggleComplete: async (id) => {
        const { todos, userId } = get()
        const todo = todos.find((t) => t.id === id)
        if (!todo) return

        const newCompleted = !todo.is_completed
        set({
          todos: todos.map((t) =>
            t.id === id ? { ...t, is_completed: newCompleted } : t
          ),
        })

        const { error } = await supabase
          .from('todos')
          .update({ is_completed: newCompleted })
          .eq('id', id)
          .eq('user_id', userId)

        if (error) {
          // 롤백
          set({
            todos: get().todos.map((t) =>
              t.id === id ? { ...t, is_completed: todo.is_completed } : t
            ),
          })
          console.error('상태 업데이트 실패:', error)
        }
      },

      // 할일 삭제
      deleteTodo: async (id) => {
        const { todos, userId } = get()
        const prev = todos.filter((t) => t.id !== id)
        set({ todos: prev })

        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)

        if (error) {
          set({ todos: get().todos.concat(todos.find((t) => t.id === id)) })
          console.error('할일 삭제 실패:', error)
        }
      },

      // 할일 알림 설정
      setReminder: async (id, reminderAt) => {
        const { todos, userId } = get()
        const original = todos.find((t) => t.id === id)
        set({ todos: todos.map((t) => (t.id === id ? { ...t, reminder_at: reminderAt } : t)) })
        const { error } = await supabase
          .from('todos')
          .update({ reminder_at: reminderAt })
          .eq('id', id)
          .eq('user_id', userId)
        if (error) {
          set({ todos: get().todos.map((t) => (t.id === id ? original : t)) })
          console.error('알림 설정 실패:', error)
        }
      },

      // 할일 수정
      updateTodo: async (id, updates) => {
        const { todos, userId } = get()
        const original = todos.find((t) => t.id === id)
        set({
          todos: todos.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })

        const { error } = await supabase
          .from('todos')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId)

        if (error) {
          set({
            todos: get().todos.map((t) => (t.id === id ? original : t)),
          })
          console.error('할일 수정 실패:', error)
        }
      },

      // 필터링된 할일 반환
      getFilteredTodos: () => {
        const { todos, filter } = get()
        const today = new Date().toISOString().split('T')[0]

        switch (filter) {
          case 'today':
            return todos.filter((t) => !t.is_completed && t.deadline === today)
          case 'completed':
            return todos.filter((t) => t.is_completed)
          default:
            return todos
        }
      },
    }),
    {
      name: 'voicedo-storage',
      partialize: (state) => ({
        username: state.username,
        userId: state.userId,
        todos: state.todos,
      }),
    }
  )
)
