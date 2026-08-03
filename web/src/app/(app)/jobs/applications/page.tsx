import { redirect } from 'next/navigation';

/**
 * The applications tab lives on the Jobs screen.
 *
 * This route exists because notifications and the post-apply toast both link
 * to it — a job-response notification is about an application, not a post, and
 * sending somebody to a URL that 404s is worse than an extra hop.
 */
export default function JobApplicationsPage() {
  redirect('/jobs/mine');
}
