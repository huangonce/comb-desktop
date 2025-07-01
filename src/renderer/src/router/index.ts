import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: 'DashboardCollectAlibaba' }
  },
  {
    path: '/',
    redirect: { name: 'DashboardOverview' },
    component: () => import('@renderer/layouts/MainLayout.vue'),
    children: [
      {
        path: '/dashboard/overview',
        name: 'DashboardOverview',
        component: () => import('@renderer/pages/dashboard/OverviewView.vue')
      },
      {
        path: '/dashboard/collect/alibaba',
        name: 'DashboardCollectAlibaba',
        component: () => import('@renderer/pages/dashboard/collect/AlibabaView.vue')
      },
      {
        path: '/dashboard/collect/made-in-china',
        name: 'DashboardCollectMadeInChina',
        component: () => import('@renderer/pages/dashboard/collect/MadeInChinaView.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

// router.beforeEach((to, from, next) => {

//   next()
// })

export default router
